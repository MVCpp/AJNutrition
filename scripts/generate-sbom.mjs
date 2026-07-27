#!/usr/bin/env node
/**
 * Generates a CycloneDX 1.5 SBOM of the PRODUCTION dependency tree.
 *
 *   node scripts/generate-sbom.mjs [--out docs/security/sbom.json]
 *
 * Source of truth is `pnpm licenses list --json --prod`, so the SBOM matches
 * the installed lockfile rather than a hand-kept list.
 *
 * Two things this deliberately does NOT do:
 * - it never records the absolute paths pnpm reports (they embed the OS
 *   account name, and the SBOM is a file we hand to third parties);
 * - it stamps no generation time, so regenerating without dependency changes
 *   produces a byte-identical file and a real diff means a real change.
 *
 * Optional deps resolve per platform (Electron, better-sqlite3 prebuilds), so
 * the file must be regenerated on the machine that builds the release.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.indexOf('--out');
const outPath = path.resolve(
  repoRoot,
  outFlag === -1 ? 'docs/security/sbom.json' : (process.argv[outFlag + 1] ?? ''),
);

const appManifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'apps/desktop/package.json'), 'utf8'),
);

function pnpmLicenses() {
  // Fixed command, no interpolation: shell execution is safe here and is the
  // only portable way to reach pnpm's .cmd shim on Windows.
  const raw = execSync('pnpm licenses list --json --prod', {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

/** `@scope/name` → `pkg:npm/%40scope/name@version` per the purl spec. */
function purl(name, version) {
  const encoded = name.startsWith('@')
    ? `%40${name.slice(1).replace('/', '/')}`
    : encodeURIComponent(name);
  return `pkg:npm/${encoded}@${version}`;
}

const byLicense = pnpmLicenses();
const components = [];
for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    for (const version of pkg.versions ?? []) {
      components.push({
        type: 'library',
        name: pkg.name,
        version,
        purl: purl(pkg.name, version),
        licenses:
          license === 'Unknown'
            ? undefined
            : [
                license.includes(' OR ') || license.includes(' AND ')
                  ? { expression: license }
                  : { license: { id: license } },
              ],
        externalReferences: pkg.homepage
          ? [{ type: 'website', url: String(pkg.homepage) }]
          : undefined,
      });
    }
  }
}
// Electron is a devDependency of the workspace but is EMBEDDED in the shipped
// artifact, together with Chromium and Node. Omitting it would make the SBOM
// describe the source tree rather than the product.
const electronVersion = JSON.parse(
  readFileSync(path.join(repoRoot, 'node_modules/electron/package.json'), 'utf8'),
).version;
components.push({
  type: 'framework',
  name: 'electron',
  version: electronVersion,
  purl: purl('electron', electronVersion),
  description: 'Bundled runtime; embeds Chromium and Node.js',
  licenses: [{ license: { id: 'MIT' } }],
  externalReferences: [{ type: 'website', url: 'https://www.electronjs.org/' }],
});

components.sort((a, b) => a.purl.localeCompare(b.purl));

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    component: {
      type: 'application',
      name: 'NutriPlan',
      version: appManifest.version,
      description: 'Gestión de consulta nutricional (escritorio, local-first)',
    },
    tools: [{ name: 'scripts/generate-sbom.mjs', vendor: 'NutriPlan' }],
  },
  components,
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');

const unknown = components.filter((c) => c.licenses === undefined);
console.log(`SBOM: ${components.length} components → ${path.relative(repoRoot, outPath)}`);
if (unknown.length > 0) {
  console.log(`⚠ ${unknown.length} component(s) without a declared license:`);
  for (const c of unknown) console.log(`  - ${c.name}@${c.version}`);
}

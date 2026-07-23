import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar') as {
  createPackage(src: string, dest: string): Promise<void>;
};

const REPO_ROOT = process.cwd();
const VERIFY_SCRIPT = path.join(REPO_ROOT, 'scripts', 'verify-package.mjs');
const REQUIRED_ASAR_FILES = {
  '.vite/build/main.js': 'module.exports = {};\n',
  '.vite/build/preload.js': 'module.exports = {};\n',
  '.vite/renderer/main_window/index.html': '<!doctype html><title>AJNutrition</title>\n',
};
const REQUIRED_NATIVE_PACKAGES = [
  'better-sqlite3-multiple-ciphers',
  'bindings',
  'file-uri-to-path',
];

function writeFiles(baseDir: string, files: Record<string, string>) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(baseDir, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
}

async function createPackagedOutDir(options: { unpackNativePackages: boolean }) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ajn-verify-package-'));
  const sourceDir = path.join(tempDir, 'source');
  const outDir = path.join(tempDir, 'out');
  const resourcesDir = path.join(outDir, 'AJNutrition-test', 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  const unpackedDir = `${asarPath}.unpacked`;

  writeFiles(sourceDir, REQUIRED_ASAR_FILES);
  if (!options.unpackNativePackages) {
    writeFiles(
      sourceDir,
      Object.fromEntries(
        REQUIRED_NATIVE_PACKAGES.map((packageName) => [
          `node_modules/${packageName}/package.json`,
          JSON.stringify({ name: packageName, main: 'index.js' }),
        ]),
      ),
    );
  }

  mkdirSync(resourcesDir, { recursive: true });
  await asar.createPackage(sourceDir, asarPath);

  writeFiles(unpackedDir, {
    'node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node': 'binary',
    ...(options.unpackNativePackages
      ? Object.fromEntries(
          REQUIRED_NATIVE_PACKAGES.map((packageName) => [
            `node_modules/${packageName}/package.json`,
            JSON.stringify({ name: packageName, main: 'index.js' }),
          ]),
        )
      : {}),
  });

  return outDir;
}

function runVerifier(outDir: string) {
  return execFileSync('node', [VERIFY_SCRIPT, outDir], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

describe('verify-package.mjs', () => {
  it('accepts native package manifests inside app.asar', async () => {
    const outDir = await createPackagedOutDir({ unpackNativePackages: false });
    expect(runVerifier(outDir)).toContain('PACKAGE VERIFICATION OK');
  });

  it('accepts native package manifests from app.asar.unpacked', async () => {
    const outDir = await createPackagedOutDir({ unpackNativePackages: true });
    expect(runVerifier(outDir)).toContain('PACKAGE VERIFICATION OK');
  });
});

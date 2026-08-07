#!/usr/bin/env node
/**
 * Makes a fresh clone actually runnable after `pnpm install`.
 *
 * Two things are missing otherwise, and both fail confusingly rather than
 * loudly:
 *
 * 1. **The Electron binary.** `electron` ships NO npm scripts — it exposes an
 *    `install-electron` bin instead. So `node_modules/electron/dist` is never
 *    populated by install alone, and nothing warns you: `pnpm dev` just dies.
 *    (`allowBuilds: electron: true` in pnpm-workspace.yaml is a no-op for this
 *    reason — it permits a build script the package does not have. It is left
 *    in place because it costs nothing and documents the intent.)
 *
 * 2. **The SQLite driver's ABI.** pnpm builds it for the SYSTEM Node, but the
 *    app and the local test command run it under Electron, which has a
 *    different NODE_MODULE_VERSION. Without this, the first unlock throws.
 *
 * Both steps are idempotent, so re-running install is cheap.
 *
 * `ELECTRON_SKIP_BINARY_DOWNLOAD=1` skips everything. CI sets it on the jobs
 * that only typecheck, lint and run the unit suite under plain Node — they
 * neither launch the app nor want the Electron-ABI driver, and downloading
 * ~100 MB for them would be waste. The jobs that DO launch it set the variable
 * empty, and get both steps.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  console.log('postinstall: ELECTRON_SKIP_BINARY_DOWNLOAD set — skipping Electron setup.');
  process.exit(0);
}

const repoRequire = createRequire(path.join(repoRoot, 'package.json'));

function run(label, file, args) {
  process.stdout.write(`postinstall: ${label}… `);
  try {
    execFileSync(process.execPath, [file, ...args], { cwd: repoRoot, stdio: 'pipe' });
    console.log('ok');
  } catch (error) {
    // Never fail the install. A developer who is offline, or behind a proxy,
    // should still get a working checkout for everything that does not need
    // the GUI — and the message says exactly how to finish the job.
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.log(`skipped (${detail})`);
    console.log(`postinstall: run \`pnpm fix:native\` and \`node ${file}\` once you can.`);
  }
}

run('unpacking the Electron binary', repoRequire.resolve('electron/install.js'), []);
run(
  'rebuilding the SQLite driver for Electron',
  path.join(repoRoot, 'scripts', 'fix-native-electron.mjs'),
  [],
);

#!/usr/bin/env node
/**
 * Repairs the dev-time native module ABI mismatch:
 *
 *   "was compiled against a different Node.js version using
 *    NODE_MODULE_VERSION ... This version of Node.js requires ..."
 *
 * pnpm installs the SQLite driver built for the system Node's ABI, and its
 * cached restore can overwrite the Electron-ABI build. This fetches the
 * driver's prebuilt binary for the Electron version actually installed.
 *
 *   pnpm fix:native
 *
 * UPGRADING ELECTRON: the driver only publishes prebuilds for some ABIs, and
 * that ceiling — not Electron's own release train — decides how far this
 * project can move. As of 12.11.1 the highest is ABI 146 = Electron 42;
 * Electron 43 (ABI 148) 404s here and would force a from-source build with a
 * full node-gyp toolchain on every CI runner. Check the available
 * `electron-v<abi>` assets before picking a target:
 *
 *   https://api.github.com/repos/m4heshd/better-sqlite3-multiple-ciphers/releases/tags/v<version>
 *
 * See docs/security/dependency-audit.md.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const repoRequire = createRequire(path.resolve('package.json'));

const electronVersion = repoRequire('electron/package.json').version;
const modulePackageJson = repoRequire.resolve('better-sqlite3-multiple-ciphers/package.json');
const moduleDir = path.dirname(modulePackageJson);
const prebuildInstallBin = repoRequire.resolve('prebuild-install/bin.js');

console.log(
  `electron ${electronVersion} → rebuilding better-sqlite3-multiple-ciphers in ${moduleDir}`,
);
execFileSync(
  process.execPath,
  [
    prebuildInstallBin,
    '--runtime',
    'electron',
    '--target',
    electronVersion,
    '--force',
    '--verbose',
  ],
  { cwd: moduleDir, stdio: 'inherit' },
);
console.log('native module ready for Electron — restart `pnpm dev`');

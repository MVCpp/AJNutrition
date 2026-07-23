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

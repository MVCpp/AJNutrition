#!/usr/bin/env node
/**
 * Packaged-app verification (S-113/S-114). Run after `electron-forge package`:
 *
 *   node scripts/verify-package.mjs apps/desktop/out
 *
 * Asserts the things that break silently with plugin-vite + native modules:
 *  - the asar contains the bundled main/preload/renderer entry points
 *  - the native SQLite driver and its runtime deps made it into the package
 *  - the native .node binary was auto-unpacked next to the asar
 * Exits non-zero with a precise message on the first failure.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node scripts/verify-package.mjs <out-dir>');
  process.exit(2);
}

function fail(message) {
  console.error(`PACKAGE VERIFICATION FAILED: ${message}`);
  process.exit(1);
}

function findFiles(dir, predicate, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, predicate, results);
    else if (predicate(full)) results.push(full);
  }
  return results;
}

if (!existsSync(outDir)) fail(`out dir not found: ${outDir}`);

const asarFiles = findFiles(outDir, (f) => path.basename(f) === 'app.asar');
if (asarFiles.length !== 1) {
  fail(`expected exactly one app.asar, found ${asarFiles.length}`);
}
const asarPath = asarFiles[0];
console.log(`asar: ${asarPath} (${(statSync(asarPath).size / 1024 / 1024).toFixed(1)} MB)`);

// Resolve @electron/asar from the desktop app's dependency tree.
const desktopRequire = createRequire(path.resolve('apps/desktop/package.json'));
const asar = desktopRequire('@electron/asar');
const entries = asar.listPackage(asarPath).map((entry) => entry.replaceAll('\\', '/'));

const requiredEntries = ['/.vite/build/main.js', '/.vite/build/preload.js'];
for (const required of requiredEntries) {
  if (!entries.includes(required)) fail(`asar is missing ${required}`);
}
if (
  !entries.some((entry) => entry.startsWith('/.vite/renderer/') && entry.endsWith('index.html'))
) {
  fail('asar is missing the renderer index.html under /.vite/renderer/');
}

const unpackedDir = `${asarPath}.unpacked`;
const requiredNativePackages = ['better-sqlite3-multiple-ciphers', 'bindings', 'file-uri-to-path'];
for (const packageName of requiredNativePackages) {
  const packageJson = `/node_modules/${packageName}/package.json`;
  if (
    !entries.includes(packageJson) &&
    !existsSync(path.join(unpackedDir, 'node_modules', packageName, 'package.json'))
  ) {
    fail(`package metadata missing for ${packageName} in app.asar and app.asar.unpacked`);
  }
}

if (!existsSync(unpackedDir)) fail(`missing ${unpackedDir} (auto-unpack did not run)`);
const nativeBinaries = findFiles(unpackedDir, (f) => f.endsWith('.node'));
if (nativeBinaries.length === 0) {
  fail('no .node binary found under app.asar.unpacked — the SQLite driver would fail at runtime');
}
for (const binary of nativeBinaries) {
  console.log(`native binary: ${path.relative(outDir, binary)}`);
}

console.log('PACKAGE VERIFICATION OK');

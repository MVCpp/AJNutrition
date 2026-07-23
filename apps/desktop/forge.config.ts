import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Packaging targets (docs/operations/packaging.md):
 *  - Windows: Squirrel installer + ZIP (built on Windows).
 *  - macOS:   DMG + ZIP (MUST be built on macOS; cross-building from
 *             Windows/Linux is not supported for signed/notarized artifacts).
 *
 * macOS signing/notarization is enabled through environment variables so no
 * credential ever lands in the repository:
 *   AJN_OSX_SIGN=1            enable osxSign (requires Developer ID cert in keychain)
 *   APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID   enable notarization
 * Unsigned builds are development builds and must be labeled as such.
 */
const enableOsxSign = process.env['AJN_OSX_SIGN'] === '1';
const appleId = process.env['APPLE_ID'];
const applePassword = process.env['APPLE_PASSWORD'];
const appleTeamId = process.env['APPLE_TEAM_ID'];

/**
 * plugin-vite ships ONLY the bundled .vite output — node_modules never reach
 * the packaged app. The encrypted SQLite driver is a native module (cannot be
 * bundled by Rollup), so it and its runtime dependency chain are copied into
 * the package explicitly. `prebuild-install` is listed as a dependency but is
 * only used at install time, so it is deliberately excluded.
 */
const NATIVE_RUNTIME_MODULES = ['better-sqlite3-multiple-ciphers', 'bindings', 'file-uri-to-path'];

function copyNativeModules(buildPath: string): void {
  // Resolve each package through the dependency chain so pnpm's strict,
  // symlinked layout is followed correctly (dereference resolves symlinks).
  let resolveFrom = createRequire(path.join(__dirname, 'package.json'));
  for (const name of NATIVE_RUNTIME_MODULES) {
    const packageJson = resolveFrom.resolve(`${name}/package.json`);
    const sourceDir = path.dirname(packageJson);
    const destDir = path.join(buildPath, 'node_modules', name);
    mkdirSync(path.dirname(destDir), { recursive: true });
    const nestedNodeModules = `${sourceDir}${path.sep}node_modules${path.sep}`;
    cpSync(sourceDir, destDir, {
      recursive: true,
      dereference: true,
      filter: (src) => src === sourceDir || !src.includes(nestedNodeModules),
    });
    resolveFrom = createRequire(packageJson);
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'AJNutrition',
    executableName: 'ajnutrition',
    appBundleId: 'com.ajnutrition.desktop',
    asar: true,
    ...(enableOsxSign ? { osxSign: {} } : {}),
    ...(appleId && applePassword && appleTeamId
      ? { osxNotarize: { appleId, appleIdPassword: applePassword, teamId: appleTeamId } }
      : {}),
  },
  rebuildConfig: {},
  hooks: {
    packageAfterPrune: async (_config, buildPath) => {
      copyNativeModules(buildPath);
    },
  },
  makers: [
    // Squirrel chosen for the first Windows releases (per-user install, no admin
    // rights, delta updates). Revisit vs WiX/MSI in ADR-0009 before enterprise use.
    new MakerSquirrel({ setupExe: 'AJNutrition-Setup.exe' }),
    new MakerDMG({}, ['darwin']),
    new MakerZIP({}, ['win32', 'darwin']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
    // Electron hardening fuses (docs/security/threat-model.md):
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;

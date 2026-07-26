import { defineConfig } from '@playwright/test';

/**
 * E2E suite: drives the PACKAGED Electron app (apps/desktop/out/…) against an
 * isolated temporary userData dir. Build it first:
 *
 *   pnpm package   (electron-forge package)
 *   pnpm e2e
 *
 * Serial by design — the journey (setup → unlock → capture) is one story and
 * the app holds an exclusive lock on its database.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
});

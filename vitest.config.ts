import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/desktop/src/**/*.test.ts'],
    // The auth/backup tests run real scrypt key derivation (slow by design);
    // loaded windows-latest CI runners blow the 5 s default and flake.
    testTimeout: 30_000,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.ts',
      'services/*/src/**/*.test.ts',
      'apps/desktop/src/**/*.test.ts',
      // Component tests. They opt into a DOM per file with a
      // `@vitest-environment happy-dom` docblock, so the default stays 'node'
      // — the database and main-process suites must not pay for a DOM.
      'apps/desktop/src/**/*.test.tsx',
    ],
    // The auth/backup tests run real scrypt key derivation (slow by design);
    // loaded windows-latest CI runners blow the 5 s default and flake.
    testTimeout: 30_000,
  },
});

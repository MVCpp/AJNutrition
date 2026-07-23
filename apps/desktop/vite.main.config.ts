import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // plugin-vite derives the output filename from the entry's base name via
    // Rollup's [name] substitution.  Our entry is src/main/index.ts, so the
    // default would produce index.js — but package.json#main (and the
    // verify-package script) expect .vite/build/main.js.  Setting build.lib
    // explicitly overrides the plugin's default and pins the output name.
    lib: {
      entry: 'src/main/index.ts',
      fileName: () => 'main.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      // Native module: must stay external (cannot be bundled by Rollup).
      // Packaging validation for external natives is tracked in the Phase 8
      // release checklist (docs/product/gap-analysis.md).
      external: ['better-sqlite3-multiple-ciphers'],
    },
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      // Native module: must stay external (cannot be bundled by Rollup).
      // Packaging validation for external natives is tracked in the Phase 8
      // release checklist (docs/product/gap-analysis.md).
      external: ['better-sqlite3'],
    },
  },
});

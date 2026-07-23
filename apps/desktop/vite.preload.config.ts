import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // plugin-vite derives the output filename from the entry's base name via
    // Rollup's [name] substitution.  Our entry is src/preload/index.ts, so the
    // default would produce index.js — but the main process and the
    // verify-package script both expect .vite/build/preload.js.  Setting
    // build.lib explicitly overrides the plugin's default and pins the name.
    lib: {
      entry: 'src/preload/index.ts',
      fileName: () => 'preload.js',
      formats: ['cjs'],
    },
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // plugin-vite builds preload via rollupOptions.input (not build.lib) and
        // defaults entryFileNames to '[name].js'.  Our entry is
        // src/preload/index.ts, so [name] resolves to 'index' — producing
        // index.js.  Override entryFileNames here to pin the output to
        // preload.js, which is what the main process and verify-package expect.
        entryFileNames: 'preload.js',
      },
    },
  },
});

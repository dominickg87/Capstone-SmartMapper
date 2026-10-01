import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content.ts'),
      name: 'SmartMapperContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});

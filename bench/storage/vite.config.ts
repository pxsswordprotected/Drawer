// Builds the storage bench's two browser bundles (never part of the extension build):
//   npx vite build -c bench/storage/vite.config.ts --mode tab    app storage + store, per tab
//   npx vite build -c bench/storage/vite.config.ts --mode host   the simulator
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  publicDir: false,
  define: { __DRAWER_DEBUG__: 'false' },
  resolve: { alias: { '@': path.resolve(__dirname, '../../src') } },
  build: {
    outDir: path.resolve(__dirname, '.build'),
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input: path.resolve(__dirname, `${mode}.ts`),
      output: {
        format: 'iife' as const,
        entryFileNames: `${mode}.js`,
        inlineDynamicImports: true,
      },
    },
  },
}));

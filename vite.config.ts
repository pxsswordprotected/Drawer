import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Only use crx plugin for extension build, not for test page
  const plugins = [react()];

  // Add crx plugin only when building the extension
  if (mode !== 'test') {
    plugins.push(crx({ manifest }));
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          popup: 'src/popup/index.html',
          test: 'src/test/index.html',
        },
      },
    },
  };
});

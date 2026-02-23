import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const plugins = [react()];

  if (mode === 'extension') {
    return {
      plugins,
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      build: {
        cssCodeSplit: false,
        rollupOptions: {
          input: path.resolve(__dirname, 'src/content/index.tsx'),
          output: {
            format: 'iife' as const,
            name: 'DrawerContentScript',
            entryFileNames: 'content.js',
            assetFileNames: 'content.[ext]',
            inlineDynamicImports: true,
          },
        },
      },
    };
  }

  // Default: test page dev server
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
          test: 'src/test/index.html',
        },
      },
    },
  };
});

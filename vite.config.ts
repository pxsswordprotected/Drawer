import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const plugins = [react()];
  // Debug log (src/shared/debugLog.ts) is compiled in for the dev page and
  // `build:extension:debug`; the normal extension build drops it entirely.
  const define = { __DRAWER_DEBUG__: JSON.stringify(mode !== 'extension') };

  if (mode === 'extension' || mode === 'extension-debug') {
    return {
      plugins,
      define,
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
    define,
    plugins: [
      ...plugins,
      {
        name: 'serve-test-page-at-root',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/' || req.url?.startsWith('/?')) {
              req.url = '/src/test/index.html';
            }
            next();
          });
        },
      },
    ],
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

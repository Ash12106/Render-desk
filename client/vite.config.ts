import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Keep browser requests same-origin in development while the API runs in
      // the separate server workspace. Override when the API uses a fallback port.
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
      // HMR can be disabled with DISABLE_HMR when file watching is undesirable.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      globals: true,
      setupFiles: './src/setupTests.ts',
    },
  };
});

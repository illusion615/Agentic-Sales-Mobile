import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// The Power Apps plugin and power.config.json are added by `power-apps init`,
// once the target environment is chosen. Until then this runs as a plain web
// app against the local data adapter.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
  build: {
    // Code apps run inside a CSP-restricted WebView (`connect-src 'none'`).
    // Vite's module-preload polyfill uses fetch(), which the host blocks on
    // older WebViews, so keep native preload hints without that fallback.
    target: 'es2017',
    modulePreload: { polyfill: false },
  },
});

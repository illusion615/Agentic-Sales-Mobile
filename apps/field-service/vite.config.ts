import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { powerApps } from '@microsoft/power-apps-vite';
import path from 'node:path';

// Hosted as a Power Apps code app so the field crew can exercise camera, voice
// and offline capture on a real device. The app still reads and writes through
// the local IndexedDB adapter, so `power.config.json` declares no data sources.
export default defineConfig({
  plugins: [react(), tailwindcss(), powerApps()],
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

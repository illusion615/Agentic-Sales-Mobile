import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { powerApps } from '@microsoft/power-apps-vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)),
  },
  plugins: [
    react(),
    tailwindcss(),
    powerApps(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Code Apps run inside a CSP-restricted WebView (`connect-src 'none'`).
    // Vite's module-preload polyfill uses fetch(), which the host blocks on
    // older WebViews. Keep native preload hints for modern players but do not
    // inject that fetch-based fallback. ES2017 also keeps the output parseable
    // on supported legacy players.
    target: 'es2017',
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) return 'vendor-react';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
          if (id.includes('framer-motion') || id.includes('/motion/')) return 'vendor-motion';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-charts';
          if (id.includes('/jotai')) return 'vendor-state';
          if (id.includes('@microsoft/power-apps')) return 'vendor-powerapps';
          if (id.includes('date-fns')) return 'vendor-datefns';
          if (id.includes('/zod')) return 'vendor-zod';
          if (id.includes('sonner')) return 'vendor-sonner';
          return 'vendor-misc';
        },
      },
    },
  },
});

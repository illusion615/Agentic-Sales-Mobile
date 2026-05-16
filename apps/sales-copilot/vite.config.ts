import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      devOptions: { enabled: command === 'serve' },
      manifest: {
        name: 'Sales Copilot',
        short_name: 'Sales Copilot',
        description: 'Agentic Sales Mobile — field sales companion',
        theme_color: '#0F1424',
        background_color: '#0F1424',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Power Apps host bridge — stubbed locally so try/catch fallbacks engage.
      '@microsoft/power-apps/app': path.resolve(__dirname, './app-gen-sdk/power-apps-stub.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
}));

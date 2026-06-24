import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@microsoft/power-apps/data': path.resolve(__dirname, './src/__mocks__/power-apps-data.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'threads',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/__tests__/setup.ts'],
  },
});

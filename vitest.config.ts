import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: '.vitest-cache',
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname,
    },
  },
});

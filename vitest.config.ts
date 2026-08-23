import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Only needed so vitest can transform .tsx files with literal JSX (like
  // component tests) — tsconfig.json's jsx: "preserve" is for Next's own
  // SWC pipeline and vite's default transform can't handle that mode itself.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', 'packages/**'],
  },
});

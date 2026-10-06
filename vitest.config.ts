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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Files the suite actually loads. A repo-wide include would count
      // untested UI at 0% and make the line floor below impossible.
      thresholds: {
        lines: 70,
        statements: 65,
        branches: 55,
        functions: 60,
        'lib/images/feedLcp.ts': { lines: 90 },
        'lib/images/feedLcpProbe.ts': { lines: 90 },
        'lib/images/feedImageSrc.ts': { lines: 90 },
        'lib/images/imageProxy.ts': { lines: 90 },
        'lib/perf/afterPriorityImage.ts': { lines: 90 },
        'lib/blog/longReads.ts': { lines: 90 },
        'app/api/image-proxy/route.ts': { lines: 90 },
        'components/shared/DeferredFeedMedia.tsx': { lines: 90 },
        'components/shared/OffscreenGate.tsx': { lines: 90 },
      },
    },
  },
});

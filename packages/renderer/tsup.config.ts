import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/speakAudio.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@hiveio/content-renderer'],
});

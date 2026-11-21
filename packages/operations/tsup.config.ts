import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        video: 'src/video.ts',
        audio: 'src/audio.ts',
        limits: 'src/limits.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    external: ['tus-js-client'],
});

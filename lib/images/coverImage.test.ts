import { describe, expect, it } from 'vitest';
import {
    PROFILE_COVER_WIDTH,
    coverProbePath,
    profileCoverLoaderSrc,
    resolveCoverImageSrc,
} from './coverImage';
import { IMAGE_PROXY_PATH } from './feedImageSrc';

const DISCORD = 'https://cdn.discordapp.com/attachments/409556855400955909/421701212996370445/Meno_banner_Blue.png';

describe('resolveCoverImageSrc', () => {
    it('sends an absolute cover through the same-origin proxy', () => {
        const src = resolveCoverImageSrc(DISCORD);
        expect(src).toBe(`${IMAGE_PROXY_PATH}?url=${encodeURIComponent(DISCORD)}`);
        expect(src).not.toContain('images.hive.blog');
    });

    it('trims whitespace and drops a fragment', () => {
        expect(resolveCoverImageSrc('  https://files.peakd.com/file/a.png#x  ')).toBe(
            `${IMAGE_PROXY_PATH}?url=${encodeURIComponent('https://files.peakd.com/file/a.png')}`,
        );
    });

    it('does not request a missing, local, or unsafe cover', () => {
        expect(resolveCoverImageSrc('')).toBeNull();
        expect(resolveCoverImageSrc('   ')).toBeNull();
        expect(resolveCoverImageSrc(null)).toBeNull();
        expect(resolveCoverImageSrc(undefined)).toBeNull();
        expect(resolveCoverImageSrc('/logo.png')).toBeNull();
        expect(resolveCoverImageSrc('javascript:alert(1)')).toBeNull();
        expect(resolveCoverImageSrc('http://127.0.0.1/secret.jpg')).toBeNull();
        expect(resolveCoverImageSrc('http://169.254.169.254/latest/meta-data')).toBeNull();
        expect(resolveCoverImageSrc('https://user:pass@example.com/a.jpg')).toBeNull();
    });
});

describe('cover image request shape', () => {
    it('probes the proxy and asks the optimizer for one fixed width', () => {
        const src = resolveCoverImageSrc('https://i.imgur.com/TyZjlBu.jpg')!;
        expect(coverProbePath(src)).toBe(`${src}&probe=1`);
        const optimized = profileCoverLoaderSrc(src);
        expect(optimized).toContain('/_next/image?url=');
        expect(optimized).toContain(`w=${PROFILE_COVER_WIDTH}`);
        expect(optimized).toContain(encodeURIComponent(src));
        expect(PROFILE_COVER_WIDTH).toBe(1200);
    });
});

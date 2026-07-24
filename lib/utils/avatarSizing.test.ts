import { describe, it, expect } from 'vitest';
import { pxToAvatarToken, resolveAvatarToken, urlSizeForAvatarToken, AVATAR_TOKEN_PX } from './avatarSizing';

describe('pxToAvatarToken', () => {
    it('maps an exact token px value back to that token', () => {
        for (const [token, px] of Object.entries(AVATAR_TOKEN_PX)) {
            expect(pxToAvatarToken(px)).toBe(token);
        }
    });

    it('rounds to the nearest token when px falls between two tokens', () => {
        expect(pxToAvatarToken(36)).toBe('sm'); // 4 away from sm(32), 12 away from md(48)
        expect(pxToAvatarToken(52)).toBe('md'); // 4 away from md(48), 12 away from lg(64)
        expect(pxToAvatarToken(100)).toBe('xl'); // 4 away from xl(96), 28 away from 2xl(128)
    });

    it('clamps to the smallest token below the whole range and the largest above it', () => {
        expect(pxToAvatarToken(1)).toBe('2xs');
        expect(pxToAvatarToken(500)).toBe('2xl');
    });
});

describe('resolveAvatarToken', () => {
    it('passes an already-valid token straight through', () => {
        expect(resolveAvatarToken('sm')).toBe('sm');
        expect(resolveAvatarToken('2xl')).toBe('2xl');
    });

    it('resolves a raw px string to the nearest token', () => {
        expect(resolveAvatarToken('36px')).toBe('sm');
        expect(resolveAvatarToken('52px')).toBe('md');
        // the exact size WalletPage/ProfilePage use at desktop width
        expect(resolveAvatarToken('100px')).toBe('xl');
    });

    it('prefers the md breakpoint from a responsive object, matching Snap.tsx-style usage', () => {
        expect(resolveAvatarToken({ base: '72px', md: '100px' })).toBe('xl');
    });

    it('falls back through base/lg/sm/xl in order when md is absent from a responsive object', () => {
        expect(resolveAvatarToken({ base: '36px' })).toBe('sm');
        expect(resolveAvatarToken({ lg: '64px' })).toBe('lg');
    });

    it('falls back to md for garbage input rather than throwing', () => {
        expect(resolveAvatarToken('not-a-size')).toBe('md');
        expect(resolveAvatarToken({})).toBe('md');
    });
});

describe('urlSizeForAvatarToken', () => {
    it('maps the small tokens (2xs/xs/sm) to the small avatar URL tier', () => {
        expect(urlSizeForAvatarToken('2xs')).toBe('small');
        expect(urlSizeForAvatarToken('xs')).toBe('small');
        expect(urlSizeForAvatarToken('sm')).toBe('small');
    });

    it('maps the mid tokens (md/lg) to the medium avatar URL tier', () => {
        expect(urlSizeForAvatarToken('md')).toBe('medium');
        expect(urlSizeForAvatarToken('lg')).toBe('medium');
    });

    it('maps the large tokens (xl/2xl) to the large avatar URL tier', () => {
        expect(urlSizeForAvatarToken('xl')).toBe('large');
        expect(urlSizeForAvatarToken('2xl')).toBe('large');
    });
});

import { describe, expect, it } from 'vitest';
import { BRAND_SOLID, windows95ThemeDark, windows95ThemeLight } from './windows95';

/** sRGB relative luminance, WCAG 2.x. */
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveSolid(theme: typeof windows95ThemeDark) {
  const solid = theme.components.Button.variants.solid as unknown;
  if (typeof solid === 'function') {
    return (solid as (props: Record<string, unknown>) => {
      bg: string;
      color: string;
      _hover: { bg: string };
    })({});
  }
  return solid as { bg: string; color: string; _hover: { bg: string } };
}

describe('brand solid button contrast', () => {
  it('keeps the dark-mode logo primary for links and outlines', () => {
    expect(windows95ThemeDark.colors.primary).toBe('#00a8ff');
    expect(windows95ThemeLight.colors.primary).toBe('#0369a1');
  });

  it('meets WCAG AA 4.5:1 for white label text in both modes, including hover', () => {
    for (const mode of ['dark', 'light'] as const) {
      const { bg, hover } = BRAND_SOLID[mode];
      expect(contrastRatio('#ffffff', bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#ffffff', hover)).toBeGreaterThanOrEqual(4.5);
    }
    // The previous dark-mode fill, the logo cyan, fails AA with white text.
    expect(contrastRatio('#ffffff', '#00a8ff')).toBeLessThan(4.5);
  });

  it('wires the AA fills into the solid Button variant', () => {
    const darkSolid = resolveSolid(windows95ThemeDark);
    const lightSolid = resolveSolid(windows95ThemeLight);
    expect(darkSolid.bg).toBe(BRAND_SOLID.dark.bg);
    expect(darkSolid.color).toBe('white');
    expect(darkSolid._hover.bg).toBe(BRAND_SOLID.dark.hover);
    expect(lightSolid.bg).toBe(BRAND_SOLID.light.bg);
    expect(lightSolid._hover.bg).toBe(BRAND_SOLID.light.hover);
  });
});

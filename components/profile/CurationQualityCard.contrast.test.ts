import { describe, expect, it } from 'vitest';
import { theme } from '@chakra-ui/react';
import { scoreColorScheme } from './CurationQualityCard';

function token(path: string): string {
  const [hue, shade] = path.split('.');
  if (!shade) return path === 'white' ? '#ffffff' : path;
  return (theme.colors as unknown as Record<string, Record<string, string>>)[hue][shade];
}

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = ch.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('curation score chip contrast', () => {
  it.each([95, 75, 50, 10])('score %i text clears WCAG AA 4.5:1 on its fill', (score) => {
    const { bg, fg } = scoreColorScheme(score);
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

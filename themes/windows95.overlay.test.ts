import { describe, expect, it } from 'vitest';
import { windows95ThemeDark, windows95ThemeLight } from './windows95';

type Colors = { overlay: Record<string, string>; overlayFill: string };

describe('overlay tokens', () => {
  it('raises dark overlay.400 for text but keeps neutral fills at the old weight', () => {
    const dark = windows95ThemeDark.colors as unknown as Colors;
    expect(dark.overlay['400']).toBe('rgba(255, 255, 255, 0.52)');
    expect(dark.overlayFill).toBe('rgba(255, 255, 255, 0.24)');
  });

  it('keeps light-mode fills identical to overlay.400', () => {
    const light = windows95ThemeLight.colors as unknown as Colors;
    expect(light.overlayFill).toBe(light.overlay['400']);
  });
});

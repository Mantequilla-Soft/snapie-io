import { describe, expect, it } from 'vitest';
import { windows95ThemeDark } from './windows95';

type StyleFn = (props: Record<string, unknown>) => {
  dialog?: { mx?: string; my?: string; pl?: string; pr?: string; pb?: string };
};

describe('windows95 safe-area overlays (#258)', () => {
  it('keeps Modal dialogs clear of the notch via max(...) margins', () => {
    const baseStyle = windows95ThemeDark.components?.Modal?.baseStyle as StyleFn;
    const dialog = baseStyle({ colorMode: 'dark' }).dialog;
    expect(dialog?.mx).toBe('max(1rem, env(safe-area-inset-left), env(safe-area-inset-right))');
    expect(dialog?.my).toBe('max(4rem, env(safe-area-inset-top), env(safe-area-inset-bottom))');
    expect(dialog?.mx).toContain('max(');
    expect(dialog?.my).toContain('max(');
  });

  it('pads Drawer dialogs for edge-to-edge bottom sheets', () => {
    const baseStyle = windows95ThemeDark.components?.Drawer?.baseStyle as StyleFn;
    const dialog = baseStyle({ colorMode: 'dark', placement: 'bottom' }).dialog;
    expect(dialog?.pl).toBe('env(safe-area-inset-left)');
    expect(dialog?.pr).toBe('env(safe-area-inset-right)');
    expect(dialog?.pb).toBe('env(safe-area-inset-bottom)');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { browserLanguageTag } from './browserLanguage';

describe('browserLanguageTag', () => {
  const original = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: original,
      configurable: true,
    });
  });

  it('uses the language subtag', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'pt-BR' },
      configurable: true,
    });
    expect(browserLanguageTag()).toBe('pt');
  });

  it('falls back when navigator exists without a language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    expect(browserLanguageTag()).toBe('en');
  });
});

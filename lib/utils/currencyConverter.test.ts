// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import {
  convertHBDToDisplayCurrency,
  isValidDisplayCurrency,
  clearCachedRates,
} from './currencyConverter';

describe('isValidDisplayCurrency', () => {
  it('accepts 3-letter ISO-style codes (any case, trimmed)', () => {
    expect(isValidDisplayCurrency('BRL')).toBe(true);
    expect(isValidDisplayCurrency('eur')).toBe(true);
    expect(isValidDisplayCurrency(' Gbp ')).toBe(true);
    expect(isValidDisplayCurrency('USD')).toBe(true);
    expect(isValidDisplayCurrency('JPY')).toBe(true);
  });

  it('rejects empty, junk, and non-code values', () => {
    expect(isValidDisplayCurrency(undefined)).toBe(false);
    expect(isValidDisplayCurrency(null)).toBe(false);
    expect(isValidDisplayCurrency('')).toBe(false);
    expect(isValidDisplayCurrency('   ')).toBe(false);
    expect(isValidDisplayCurrency('>')).toBe(false);
    expect(isValidDisplayCurrency('  >  ')).toBe(false);
    expect(isValidDisplayCurrency('R$')).toBe(false);
    expect(isValidDisplayCurrency('US')).toBe(false);
    expect(isValidDisplayCurrency('USDD')).toBe(false);
  });
});

describe('convertHBDToDisplayCurrency', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    clearCachedRates();
    warnSpy.mockClear();
    fetchSpy.mockReset();
  });

  afterEach(() => {
    clearCachedRates();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('returns HBD/$ and does not warn for invalid currency ">"', async () => {
    await expect(convertHBDToDisplayCurrency(1.25, '>')).resolves.toBe('$1.250');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns HBD/$ and does not warn for whitespace-padded junk', async () => {
    await expect(convertHBDToDisplayCurrency(2, '  >  ')).resolves.toBe('$2.000');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns HBD/$ without warning when currency is missing', async () => {
    await expect(convertHBDToDisplayCurrency(0.5)).resolves.toBe('$0.500');
    await expect(convertHBDToDisplayCurrency(0.5, '')).resolves.toBe('$0.500');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns USD string for USD without fetching rates', async () => {
    await expect(convertHBDToDisplayCurrency(1.111, 'usd')).resolves.toBe('$1.111');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('converts using rates for a valid currency like BRL', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hive_dollar: { brl: 5 } }),
    } as Response);

    await expect(convertHBDToDisplayCurrency(2, 'BRL')).resolves.toBe('R$10.00');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('converts EUR when rates are available', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hive_dollar: { eur: 0.9 } }),
    } as Response);

    await expect(convertHBDToDisplayCurrency(10, 'EUR')).resolves.toBe('€9.00');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns only when a well-formed code is missing from the rate map', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hive_dollar: { brl: 5 } }),
    } as Response);

    await expect(convertHBDToDisplayCurrency(1, 'NZD')).resolves.toBe('$1.000');
    expect(warnSpy).toHaveBeenCalledWith(
      'Exchange rate not found for NZD, falling back to HBD',
    );
  });
});

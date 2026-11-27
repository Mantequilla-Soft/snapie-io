/**
 * Currency Converter Utility
 * 
 * Converts HBD values to different currencies using CoinGecko API
 * Features:
 * - 6-hour localStorage caching to minimize API calls
 * - No conversion for USD (HBD ≈ USD)
 * - Graceful fallback on errors
 */

const CACHE_KEY = 'hbd_exchange_rates';
const CACHE_TIMESTAMP_KEY = 'hbd_exchange_rates_timestamp';
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

interface ExchangeRates {
  [currency: string]: number;
}

interface CachedData {
  timestamp: number;
  rates: ExchangeRates;
}

/**
 * Currency symbols mapping
 */
const CURRENCY_SYMBOLS: { [key: string]: string } = {
  USD: '$',
  BRL: 'R$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'Fr',
  CNY: '¥',
  INR: '₹',
};

/** ISO-4217-style 3-letter currency codes only (e.g. BRL, EUR). Junk like `>` is ignored. */
const DISPLAY_CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * True when the value is a usable display-currency code after trim + upper case.
 * Empty, whitespace, and garbage env values (e.g. `>`) return false.
 */
export function isValidDisplayCurrency(currency: string | undefined | null): boolean {
  if (!currency) return false;
  return DISPLAY_CURRENCY_CODE.test(currency.trim().toUpperCase());
}

/**
 * Get currency symbol for a given currency code
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] || currency.toUpperCase() + ' ';
}

/**
 * Check if cached exchange rates are still valid
 */
function isCacheValid(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;

    const cacheAge = Date.now() - parseInt(timestamp, 10);
    return cacheAge < CACHE_DURATION;
  } catch (error) {
    console.error('Error checking cache validity:', error);
    return false;
  }
}

/**
 * Get cached exchange rates from localStorage
 */
function getCachedRates(): ExchangeRates | null {
  if (typeof window === 'undefined') return null;
  
  try {
    if (!isCacheValid()) return null;

    const cachedData = localStorage.getItem(CACHE_KEY);
    if (!cachedData) return null;

    const rates = JSON.parse(cachedData);
    return rates;
  } catch (error) {
    console.error('Error reading cached rates:', error);
    return null;
  }
}

/**
 * Save exchange rates to localStorage
 */
function cacheRates(rates: ExchangeRates): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.error('Error caching rates:', error);
  }
}

/**
 * Fetch exchange rates from CoinGecko API
 */
async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const currencies = ['brl', 'eur', 'gbp', 'jpy', 'aud', 'cad', 'chf', 'cny', 'inr'];
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=hive_dollar&vs_currencies=${currencies.join(',')}`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.hive_dollar) {
      throw new Error('Invalid response from CoinGecko API');
    }

    // Convert to uppercase keys for consistency
    const rates: ExchangeRates = {};
    Object.keys(data.hive_dollar).forEach(currency => {
      rates[currency.toUpperCase()] = data.hive_dollar[currency];
    });

    // Cache the rates
    cacheRates(rates);

    return rates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return null;
  }
}

/**
 * Get exchange rates (from cache or API)
 */
async function getExchangeRates(): Promise<ExchangeRates | null> {
  // Try to get from cache first
  const cachedRates = getCachedRates();
  if (cachedRates) {
    return cachedRates;
  }

  // Fetch fresh rates if cache is invalid
  return await fetchExchangeRates();
}

/**
 * Convert HBD amount to display currency
 * 
 * @param hbdAmount - Amount in HBD
 * @param targetCurrency - Target currency code (optional, from env variable)
 * @returns Formatted string with currency symbol
 */
export async function convertHBDToDisplayCurrency(
  hbdAmount: number,
  targetCurrency?: string
): Promise<string> {
  const currency = (targetCurrency ?? '').trim().toUpperCase();

  // Missing or invalid codes (empty, `>`, etc.) → sync HBD/$ with no warn/API call.
  if (!isValidDisplayCurrency(currency)) {
    return `$${hbdAmount.toFixed(3)}`;
  }

  // If target is USD, no conversion needed (HBD ≈ USD)
  if (currency === 'USD') {
    return `$${hbdAmount.toFixed(3)}`;
  }

  try {
    // Get exchange rates
    const rates = await getExchangeRates();

    if (!rates || !rates[currency]) {
      console.warn(`Exchange rate not found for ${currency}, falling back to HBD`);
      return `$${hbdAmount.toFixed(3)}`;
    }

    // Convert HBD to target currency
    const convertedAmount = hbdAmount * rates[currency];
    const symbol = getCurrencySymbol(currency);

    // Format with appropriate decimal places
    const decimals = currency === 'JPY' ? 0 : 2; // JPY doesn't use decimals
    return `${symbol}${convertedAmount.toFixed(decimals)}`;
  } catch (error) {
    console.error('Error converting currency:', error);
    // Fallback to HBD display
    return `$${hbdAmount.toFixed(3)}`;
  }
}

/**
 * Clear cached exchange rates (useful for testing or manual refresh)
 */
export function clearCachedRates(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
  } catch (error) {
    console.error('Error clearing cached rates:', error);
  }
}

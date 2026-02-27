/**
 * currency.ts — shared currency conversion utilities
 * Exchange rates are cached in localStorage and refreshed on login/settings change.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ', JPY: '¥', CAD: 'C$', AUD: 'A$',
};

const RATES_KEY = 'exchangeRates';
const CURRENCY_KEY = 'userCurrency';

export function getUserCurrency(): string {
  return localStorage.getItem(CURRENCY_KEY) || 'USD';
}

export function setUserCurrency(c: string) {
  localStorage.setItem(CURRENCY_KEY, c);
  window.dispatchEvent(new CustomEvent('currencyChanged', { detail: c }));
}

export function getExchangeRates(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function setExchangeRates(rates: Record<string, number>) {
  localStorage.setItem(RATES_KEY, JSON.stringify(rates));
}

/**
 * Convert a USD amount to the user's selected display currency.
 */
export function convertFromUSD(usd: number, toCurrency?: string): number {
  const currency = toCurrency || getUserCurrency();
  if (currency === 'USD') return usd;
  const rates = getExchangeRates();
  const rate = rates[currency];
  return rate ? usd * rate : usd;
}

/**
 * Format a USD amount in the user's selected currency.
 */
export function fmtCurrency(usd: number, toCurrency?: string): string {
  const currency = toCurrency || getUserCurrency();
  const converted = convertFromUSD(usd, currency);
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' ';
  if (Math.abs(converted) >= 1_000_000) return `${sym}${(converted / 1_000_000).toFixed(2)}M`;
  if (Math.abs(converted) >= 1_000) return `${sym}${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${sym}${converted.toFixed(2)}`;
}

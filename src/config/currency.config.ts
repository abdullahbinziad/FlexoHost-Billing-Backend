/**
 * Central currency configuration - single source of truth for supported currencies.
 * To add a new currency: add to SUPPORTED_CURRENCIES; validations and models pick it up automatically.
 */
export const SUPPORTED_CURRENCIES = ['BDT', 'USD'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];
export const DEFAULT_CURRENCY: CurrencyCode = 'BDT';
export const isValidCurrency = (c: string): c is CurrencyCode =>
  SUPPORTED_CURRENCIES.includes(c as CurrencyCode);

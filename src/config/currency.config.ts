/**
 * Central currency configuration - single source of truth for supported currencies.
 * To add a new currency: add to SUPPORTED_CURRENCIES; validations and models pick it up automatically.
 */

export const SUPPORTED_CURRENCIES = ['BDT', 'USD'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];
export const DEFAULT_CURRENCY: CurrencyCode = 'BDT';
export const isValidCurrency = (c: string): c is CurrencyCode =>
  SUPPORTED_CURRENCIES.includes(c as CurrencyCode);

/**
 * Base currency used for reporting and sales dashboards (all amounts converted to this for totals).
 * Use env BASE_REPORTING_CURRENCY to override (e.g. USD, BDT).
 */
export const BASE_REPORTING_CURRENCY: string =
  (process.env.BASE_REPORTING_CURRENCY as CurrencyCode) || 'USD';

/**
 * Exchange rates: 1 unit of key currency = value in BASE_REPORTING_CURRENCY.
 * Example: { BDT: 0.009 } means 1 BDT = 0.009 USD when base is USD.
 * Set via env e.g. EXCHANGE_RATE_BDT=0.009 or extend this object.
 */
export const EXCHANGE_RATES_TO_BASE: Record<string, number> = {
  USD: 1,
  BDT: parseFloat(process.env.EXCHANGE_RATE_BDT || '0.009'),
};

/**
 * Convert an amount from the given currency to the base reporting currency.
 * Used for invoice totalInBase, balanceDueInBase and dashboard aggregates.
 */
export function toBaseCurrency(amount: number, currency: string): number {
  if (amount == null || Number.isNaN(amount)) return 0;
  const code = (currency || '').trim().toUpperCase() || BASE_REPORTING_CURRENCY;
  const rate = EXCHANGE_RATES_TO_BASE[code] ?? EXCHANGE_RATES_TO_BASE[BASE_REPORTING_CURRENCY] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

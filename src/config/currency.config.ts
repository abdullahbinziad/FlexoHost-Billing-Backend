/**
 * Central currency configuration - single source of truth for supported currencies.
 * To add a new currency: add to SUPPORTED_CURRENCIES; validations and models pick it up automatically.
 * Reporting base currency and FX rates come from global `config` (env BASE_REPORTING_CURRENCY, EXCHANGE_RATE_BDT).
 */

import config from './index';
import { getRuntimeExchangeRatesToBase } from '../modules/exchange-rate/runtime-fx-rate.service';

export const SUPPORTED_CURRENCIES = ['BDT', 'USD'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];
export const DEFAULT_CURRENCY: CurrencyCode = 'BDT';
export const isValidCurrency = (c: string): c is CurrencyCode =>
  SUPPORTED_CURRENCIES.includes(c as CurrencyCode);

/**
 * Base currency used for reporting and sales dashboards (all amounts converted to this for totals).
 */
export const BASE_REPORTING_CURRENCY: string =
  (config.reporting.baseCurrency as CurrencyCode) || 'USD';

/**
 * Exchange rates: 1 unit of key currency = value in BASE_REPORTING_CURRENCY.
 * Example: { BDT: 0.009 } means 1 BDT = 0.009 USD when base is USD.
 */
export const getExchangeRatesToBase = (): Record<string, number> =>
  getRuntimeExchangeRatesToBase(BASE_REPORTING_CURRENCY);

/**
 * Convert an amount from the given currency to the base reporting currency.
 * Used for invoice totalInBase, balanceDueInBase and dashboard aggregates.
 */
export function toBaseCurrency(amount: number, currency: string): number {
  if (amount == null || Number.isNaN(amount)) return 0;
  const code = (currency || '').trim().toUpperCase() || BASE_REPORTING_CURRENCY;
  const rates = getExchangeRatesToBase();
  const rate = rates[code] ?? rates[BASE_REPORTING_CURRENCY] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

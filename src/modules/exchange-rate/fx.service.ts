import ExchangeRate from './exchange-rate.model';
import { BASE_REPORTING_CURRENCY, getExchangeRatesToBase } from '../../config/currency.config';
import type { IInvoiceFxSnapshot, IPaymentFxSnapshot } from './exchange-rate.interface';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Get the exchange rate from the given currency to base (reporting) currency.
 * Uses stored historical rate for the date when available; otherwise fallback to current config.
 * Never use today's rate for historical reporting – this is for building snapshots at a specific date.
 */
export async function getRateForDate(currency: string, date: Date): Promise<{ rate: number; isFallback: boolean }> {
    const code = (currency || '').trim().toUpperCase() || BASE_REPORTING_CURRENCY;
    if (code === BASE_REPORTING_CURRENCY) {
        return { rate: 1, isFallback: false };
    }
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);

    const stored = await ExchangeRate.findOne({
        currency: code,
        baseCurrency: BASE_REPORTING_CURRENCY,
        date: { $lte: day },
    })
        .sort({ date: -1 })
        .lean()
        .exec();

    if (stored?.rateToBase != null) {
        return { rate: stored.rateToBase, isFallback: false };
    }
    const rates = getExchangeRatesToBase();
    const fallback = rates[code] ?? rates[BASE_REPORTING_CURRENCY] ?? 1;
    return { rate: fallback, isFallback: true };
}

/**
 * Convert amount from currency to base at a given date. Used when building snapshots.
 */
export async function convertToBaseAtDate(
    amount: number,
    currency: string,
    date: Date
): Promise<{ amountInBase: number; rate: number; isFallback: boolean }> {
    if (amount == null || Number.isNaN(amount)) {
        return { amountInBase: 0, rate: 1, isFallback: false };
    }
    const { rate, isFallback } = await getRateForDate(currency, date);
    return { amountInBase: round2(amount * rate), rate, isFallback };
}

/**
 * Build invoice FX snapshot at invoice date. Call from invoice service on create/update.
 */
export async function buildInvoiceFxSnapshot(params: {
    invoiceDate: Date;
    currency: string;
    subTotal: number;
    tax?: number;
    total: number;
    balanceDue: number;
}): Promise<{ snapshot: IInvoiceFxSnapshot; isLegacy: boolean }> {
    const { invoiceDate, currency, subTotal, total, balanceDue } = params;
    const tax = params.tax ?? 0;
    const { rate, isFallback } = await getRateForDate(currency, invoiceDate);

    const snapshot: IInvoiceFxSnapshot = {
        baseCurrency: BASE_REPORTING_CURRENCY,
        fxRateToBase: rate,
        fxDate: new Date(invoiceDate),
        subtotalInBase: round2(subTotal * rate),
        taxInBase: round2(tax * rate),
        totalInBase: round2(total * rate),
        balanceDueInBase: round2(balanceDue * rate),
    };
    return { snapshot, isLegacy: isFallback };
}

/**
 * Build payment FX snapshot at payment date. Call when recording a payment.
 */
export async function buildPaymentFxSnapshot(
    amount: number,
    currency: string,
    paymentDate: Date
): Promise<{ snapshot: IPaymentFxSnapshot; isLegacy: boolean }> {
    const { rate, isFallback } = await getRateForDate(currency, paymentDate);
    const snapshot: IPaymentFxSnapshot = {
        baseCurrency: BASE_REPORTING_CURRENCY,
        fxRateToBase: rate,
        fxDate: new Date(paymentDate),
        amountInBase: round2(amount * rate),
    };
    return { snapshot, isLegacy: isFallback };
}

/**
 * Get current rate from base currency to display currency (for dashboard display only).
 * 1 unit of base = rate units of displayCurrency.
 */
export function getRateFromBaseToDisplay(displayCurrency: string): number {
    const base = BASE_REPORTING_CURRENCY;
    const code = (displayCurrency || '').trim().toUpperCase() || base;
    if (code === base) return 1;
    const toBase = getExchangeRatesToBase()[code];
    if (toBase == null || toBase === 0) return 1;
    return round2(1 / toBase);
}

/**
 * Fallback: convert amount to base using current config rate. Use only for legacy data when no snapshot.
 */
export function fallbackToBase(amount: number, currency: string): number {
    if (amount == null || Number.isNaN(amount)) return 0;
    const code = (currency || '').trim().toUpperCase() || BASE_REPORTING_CURRENCY;
    const rates = getExchangeRatesToBase();
    const rate = rates[code] ?? rates[BASE_REPORTING_CURRENCY] ?? 1;
    return round2(amount * rate);
}

/**
 * Set or update a historical rate. Used by admin or backfill.
 */
export async function setRate(date: Date, currency: string, rateToBase: number): Promise<void> {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    await ExchangeRate.findOneAndUpdate(
        { date: day, currency: currency.trim().toUpperCase(), baseCurrency: BASE_REPORTING_CURRENCY },
        { rateToBase },
        { upsert: true, new: true }
    );
}

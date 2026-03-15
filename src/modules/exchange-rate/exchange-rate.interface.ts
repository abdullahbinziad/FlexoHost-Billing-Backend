import { Document, Model } from 'mongoose';

/** Stored rate: 1 unit of `currency` = `rateToBase` in `baseCurrency`. */
export interface IExchangeRate {
    date: Date;
    currency: string;
    rateToBase: number;
    baseCurrency: string;
}

export interface IExchangeRateDocument extends IExchangeRate, Document {}

export interface IExchangeRateModel extends Model<IExchangeRateDocument> {}

/** Invoice FX snapshot at invoice date – do not recalc with current rate. */
export interface IInvoiceFxSnapshot {
    baseCurrency: string;
    fxRateToBase: number;
    fxDate: Date;
    subtotalInBase: number;
    taxInBase: number;
    totalInBase: number;
    balanceDueInBase: number;
}

/** Payment FX snapshot at payment date – do not recalc with current rate. */
export interface IPaymentFxSnapshot {
    baseCurrency: string;
    fxRateToBase: number;
    fxDate: Date;
    amountInBase: number;
}

import { Document, Model, Types } from 'mongoose';

export enum TransactionStatus {
    INITIATED = 'INITIATED',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}

export enum TransactionType {
    CHARGE = 'CHARGE',
    REFUND = 'REFUND',
}

/** FX snapshot at payment date – do not recalc with current rate */
export interface IPaymentFxSnapshot {
    baseCurrency: string;
    fxRateToBase: number;
    fxDate: Date;
    amountInBase: number;
}

export interface IPaymentTransaction {
    invoiceId?: Types.ObjectId;
    orderId?: Types.ObjectId;
    clientId?: Types.ObjectId;
    userId?: Types.ObjectId;
    gateway: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    currency: string;
    /** Explicit payment date (e.g. manual payment date); else createdAt is used */
    paymentDate?: Date;
    fxSnapshot?: IPaymentFxSnapshot;
    fxSnapshotLegacy?: boolean;
    externalTransactionId?: string;
    gatewayPayload?: unknown;
}

export interface IPaymentTransactionDocument extends IPaymentTransaction, Document {}

export interface IPaymentTransactionModel extends Model<IPaymentTransactionDocument> {}


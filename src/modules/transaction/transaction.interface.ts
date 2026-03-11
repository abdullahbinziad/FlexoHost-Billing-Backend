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
    externalTransactionId?: string;
    gatewayPayload?: unknown;
}

export interface IPaymentTransactionDocument extends IPaymentTransaction, Document {}

export interface IPaymentTransactionModel extends Model<IPaymentTransactionDocument> {}


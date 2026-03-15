import { Document, Model, Types } from 'mongoose';

export enum InvoiceAction {
    DONT_INVOICE = 'DONT_INVOICE',
    INVOICE_ON_CRON = 'INVOICE_ON_CRON',
    ADD_TO_NEXT_INVOICE = 'ADD_TO_NEXT_INVOICE',
    INVOICE_NORMAL = 'INVOICE_NORMAL',
    RECUR = 'RECUR',
}

export enum RecurUnit {
    DAY = 'DAY',
    WEEK = 'WEEK',
    MONTH = 'MONTH',
    YEAR = 'YEAR',
}

export interface IBillableItem {
    clientId: Types.ObjectId;
    productId?: Types.ObjectId;
    description: string;
    unitType: 'hours' | 'qty';
    hoursOrQty: number;
    amount: number;
    invoiceAction: InvoiceAction;
    dueDate: Date;
    /** For RECUR: interval (e.g. 1 = every 1 month) */
    recurEvery?: number;
    /** For RECUR: day|week|month|year */
    recurUnit?: RecurUnit;
    /** For RECUR: how many times to recur (0 = indefinite) */
    recurCount?: number;
    /** How many times this item has been invoiced */
    invoiceCount: number;
    /** Whether currently linked to an invoice */
    invoiced: boolean;
    invoiceId?: Types.ObjectId;
    currency: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IBillableItemDocument extends IBillableItem, Document {}

export interface IBillableItemModel extends Model<IBillableItemDocument> {}

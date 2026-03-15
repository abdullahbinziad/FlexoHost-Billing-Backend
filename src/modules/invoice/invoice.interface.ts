import { Document, Model, Types } from 'mongoose';

export enum InvoiceStatus {
    UNPAID = 'UNPAID',
    PAID = 'PAID',
    OVERDUE = 'OVERDUE',
    CANCELLED = 'CANCELLED',
}

export enum InvoiceItemType {
    HOSTING = 'HOSTING',
    DOMAIN = 'DOMAIN',
    LATE_FEE = 'LATE_FEE',
}

export interface IBilledTo {
    companyName?: string;
    customerName: string;
    address: string;
    country: string;
}

export interface IInvoiceItem {
    type: InvoiceItemType;
    description: string;
    period?: {
        startDate: Date;
        endDate: Date;
    };
    amount: number;
    meta?: Record<string, any>;
}

export interface IInvoice {
    clientId: Types.ObjectId;
    invoiceNumber: string;
    status: InvoiceStatus;
    invoiceDate: Date;
    dueDate: Date;
    billedTo: IBilledTo;
    items: IInvoiceItem[];
    currency: string;
    subTotal: number;
    discount?: number;
    credit: number;
    total: number;
    balanceDue: number;
    /** Historical FX snapshot at invoice date – do not recalc with current rate */
    fxSnapshot?: {
        baseCurrency: string;
        fxRateToBase: number;
        fxDate: Date;
        subtotalInBase: number;
        taxInBase: number;
        totalInBase: number;
        balanceDueInBase: number;
    };
    /** True when snapshot was backfilled or used fallback rate (legacy) */
    fxSnapshotLegacy?: boolean;
    /** Convenience fields for aggregation – always derived from fxSnapshot when present */
    baseCurrency?: string;
    totalInBase?: number;
    balanceDueInBase?: number;
    orderId?: Types.ObjectId;
    paymentMethod?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IInvoiceDocument extends IInvoice, Document { }

export interface IInvoiceModel extends Model<IInvoiceDocument> {
    isInvoiceNumberTaken(invoiceNumber: string, excludeInvoiceId?: string): Promise<boolean>;
}

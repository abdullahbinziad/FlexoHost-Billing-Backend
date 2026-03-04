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
    credit: number;
    total: number;
    balanceDue: number;
    orderId?: Types.ObjectId;
    paymentMethod?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IInvoiceDocument extends IInvoice, Document { }

export interface IInvoiceModel extends Model<IInvoiceDocument> {
    isInvoiceNumberTaken(invoiceNumber: string, excludeInvoiceId?: string): Promise<boolean>;
}

import { Document, Model, Types } from 'mongoose';

export enum OrderStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
    PROCESSED = 'PROCESSED',
}

export enum OrderItemType {
    HOSTING = 'HOSTING',
    DOMAIN = 'DOMAIN',
    SERVER = 'SERVER',
    EMAIL = 'EMAIL',
    ADDON = 'ADDON',
}

export enum BillingCycle {
    MONTHLY = 'monthly',
    ANNUALLY = 'annually',
    TRIENNIALLY = 'triennially',
}

export interface IOrderItem {
    productId: string; // Refers to the JSON product_id
    type: OrderItemType;
    description: string;
    price: number;
    billingCycle?: BillingCycle;
    serverLocation?: string;
    domainDetails?: {
        domainName: string;
        authCode?: string;
        registrationYears?: number;
    };
}

export interface IOrder {
    userId: Types.ObjectId;
    invoiceId: Types.ObjectId;
    status: OrderStatus;
    totalAmount: number;
    currency: string;
    paymentMethod?: string;
    items: IOrderItem[];
    transactionId?: string; // Payment gateway transaction ID
    metadata?: Record<string, any>; // Extra data from payment gateway
    createdAt: Date;
    updatedAt: Date;
}

export interface IOrderDocument extends IOrder, Document { }

export interface IOrderModel extends Model<IOrderDocument> {
    // Add static methods if needed
}

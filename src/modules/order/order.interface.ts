import mongoose, { Document, Model } from 'mongoose';

export enum OrderStatus {
    DRAFT = 'DRAFT',
    PENDING_PAYMENT = 'PENDING_PAYMENT',
    PROCESSING = 'PROCESSING',
    ACTIVE = 'ACTIVE',
    CANCELLED = 'CANCELLED',
    FRAUD = 'FRAUD',
    ON_HOLD = 'ON_HOLD'
}

export interface IOrder {
    orderId: string;
    orderNumber: string;
    clientId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    status: OrderStatus;
    currency: string;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    invoiceId?: mongoose.Types.ObjectId;
    paidAt?: Date;
    meta?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export interface IOrderDocument extends IOrder, Document {
}

export interface IOrderModel extends Model<IOrderDocument> {
    isOrderNumberTaken(orderNumber: string): Promise<boolean>;
}

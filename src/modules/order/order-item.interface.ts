import mongoose, { Document, Model } from 'mongoose';
import { ServiceType, BillingCycle } from '../services/types/enums';

export enum DomainActionType {
    REGISTER = 'REGISTER',
    TRANSFER = 'TRANSFER',
    RENEW = 'RENEW'
}

export interface IOrderItemPricingSnapshot {
    setup: number;
    recurring: number;
    discount: number;
    tax: number;
    total: number;
    currency: string;
}

export interface IOrderItem {
    orderId: mongoose.Types.ObjectId;
    clientId: mongoose.Types.ObjectId;
    type: ServiceType;
    actionType?: DomainActionType; // Used for domains
    productId?: string;
    nameSnapshot: string;
    billingCycle: BillingCycle;
    qty: number;
    pricingSnapshot: IOrderItemPricingSnapshot;
    configSnapshot: Record<string, any>; // Type specific config
    createdAt: Date;
    updatedAt: Date;
}

export interface IOrderItemDocument extends IOrderItem, Document {
}

export interface IOrderItemModel extends Model<IOrderItemDocument> {
}

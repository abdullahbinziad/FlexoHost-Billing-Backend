import mongoose, { Document } from 'mongoose';
import { ServiceType, ServiceStatus, BillingCycle } from './types/enums';
import { PriceSnapshot, ProvisioningMeta } from './types/interfaces';

export interface IService extends Document {
    serviceNumber?: string;
    clientId: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
    orderId: mongoose.Types.ObjectId;
    orderItemId: mongoose.Types.ObjectId;
    invoiceId?: mongoose.Types.ObjectId;
    type: ServiceType;
    status: ServiceStatus;
    billingCycle: BillingCycle;
    currency: string;
    priceSnapshot: PriceSnapshot;
    autoRenew: boolean;
    nextDueDate: Date;
    graceUntil?: Date;
    suspendedAt?: Date;
    terminatedAt?: Date;
    provisioning?: ProvisioningMeta;
    lastInvoicedDueDate?: Date;
    meta?: Record<string, any>; // Small safe JSON for extra dynamic details
    createdAt: Date;
    updatedAt: Date;
}

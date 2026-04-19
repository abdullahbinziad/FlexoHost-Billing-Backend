import mongoose, { Schema } from 'mongoose';
import { IService } from './service.interface';
import { ServiceType, ServiceStatus, BillingCycle } from './types/enums';

const priceSnapshotSchema = new Schema(
    {
        setup: { type: Number, required: true, default: 0 },
        recurring: { type: Number, required: true, default: 0 },
        discount: { type: Number, required: true, default: 0 },
        tax: { type: Number, required: true, default: 0 },
        total: { type: Number, required: true, default: 0 },
        currency: { type: String, required: true },
    },
    { _id: false }
);

const provisioningMetaSchema = new Schema(
    {
        provider: { type: String },
        remoteId: { type: String },
        lastSyncedAt: { type: Date },
        lastError: { type: String },
    },
    { _id: false }
);

const serviceSchema = new Schema<IService>(
    {
        serviceNumber: { type: String, unique: true, sparse: true, index: true },
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        orderItemId: { type: Schema.Types.ObjectId, required: true, unique: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
        type: { type: String, enum: Object.values(ServiceType), required: true, index: true },
        status: { type: String, enum: Object.values(ServiceStatus), required: true, index: true },
        billingCycle: { type: String, enum: Object.values(BillingCycle), required: true },
        currency: { type: String, required: true },
        priceSnapshot: { type: priceSnapshotSchema, required: true },
        autoRenew: { type: Boolean, default: true },
        nextDueDate: { type: Date, required: true, index: true },
        graceUntil: { type: Date },
        suspendedAt: { type: Date },
        terminatedAt: { type: Date },
        cancelledAt: { type: Date },
        provisioning: { type: provisioningMetaSchema },
        lastInvoicedDueDate: { type: Date },
        meta: { type: Schema.Types.Mixed },
    },
    {
        timestamps: true,
    }
);

// Indexes optimized for dashboard + renewal cron
serviceSchema.index({ clientId: 1, type: 1, status: 1, createdAt: -1 });
serviceSchema.index({ status: 1, nextDueDate: 1 });

const Service = mongoose.model<IService>('Service_WHMCS', serviceSchema, 'services');

export default Service;

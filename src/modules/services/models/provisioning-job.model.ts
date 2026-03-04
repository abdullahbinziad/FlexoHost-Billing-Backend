import mongoose, { Schema, Document } from 'mongoose';
import { ServiceType, ProvisioningJobStatus } from '../types/enums';

export interface IProvisioningJob extends Document {
    clientId: mongoose.Types.ObjectId;
    orderId: mongoose.Types.ObjectId;
    orderItemId: mongoose.Types.ObjectId;
    invoiceId?: mongoose.Types.ObjectId;
    serviceType: ServiceType;
    status: ProvisioningJobStatus;
    attempts: number;
    maxAttempts: number;
    idempotencyKey: string;
    lockedAt?: Date;
    lockOwner?: string;
    lastError?: string;
    createdAt: Date;
    updatedAt: Date;
}

const provisioningJobSchema = new Schema<IProvisioningJob>(
    {
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        orderItemId: { type: Schema.Types.ObjectId, required: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
        serviceType: { type: String, enum: Object.values(ServiceType), required: true },
        status: {
            type: String,
            enum: Object.values(ProvisioningJobStatus),
            default: ProvisioningJobStatus.QUEUED,
            required: true,
            index: true
        },
        attempts: { type: Number, default: 0, required: true },
        maxAttempts: { type: Number, default: 3, required: true },
        idempotencyKey: { type: String, required: true, unique: true },
        lockedAt: { type: Date },
        lockOwner: { type: String },
        lastError: { type: String },
    },
    {
        timestamps: true,
    }
);

// Indexes optimized for finding jobs to process
provisioningJobSchema.index({ status: 1, lockedAt: 1, attempts: 1 });

const ProvisioningJob = mongoose.model<IProvisioningJob>('ProvisioningJob', provisioningJobSchema);
export default ProvisioningJob;

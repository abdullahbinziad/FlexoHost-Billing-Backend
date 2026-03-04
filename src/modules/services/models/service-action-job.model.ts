import mongoose, { Schema, Document } from 'mongoose';
import { ServiceActionType, ProvisioningJobStatus } from '../types/enums';

export interface IServiceActionJob extends Document {
    serviceId: mongoose.Types.ObjectId;
    invoiceId?: mongoose.Types.ObjectId;
    action: ServiceActionType;
    status: ProvisioningJobStatus;
    attempts: number;
    maxAttempts: number;
    lockedAt?: Date;
    lockOwner?: string;
    lastError?: string;
    createdAt: Date;
    updatedAt: Date;
}

const serviceActionJobSchema = new Schema<IServiceActionJob>(
    {
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // For uniqueness logic
        action: { type: String, enum: Object.values(ServiceActionType), required: true, index: true },
        status: {
            type: String,
            enum: Object.values(ProvisioningJobStatus),
            default: ProvisioningJobStatus.QUEUED,
            required: true,
            index: true
        },
        attempts: { type: Number, default: 0, required: true },
        maxAttempts: { type: Number, default: 3, required: true },
        lockedAt: { type: Date },
        lockOwner: { type: String },
        lastError: { type: String },
    },
    {
        timestamps: true,
    }
);

// Indexes optimized for finding jobs to process
serviceActionJobSchema.index({ status: 1, lockedAt: 1, attempts: 1 });
// Ensure uniqueness for action on a service tied to an invoice to prevent duplicates
serviceActionJobSchema.index({ serviceId: 1, action: 1, invoiceId: 1 }, { unique: true, sparse: true });

const ServiceActionJob = mongoose.model<IServiceActionJob>('ServiceActionJob', serviceActionJobSchema);
export default ServiceActionJob;

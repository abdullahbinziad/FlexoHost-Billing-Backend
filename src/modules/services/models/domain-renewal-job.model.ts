import mongoose, { Schema, Document } from 'mongoose';
import { ProvisioningJobStatus } from '../types/enums';

export interface IDomainRenewalJob extends Document {
    serviceId: mongoose.Types.ObjectId;
    domainDetailsId: mongoose.Types.ObjectId;
    invoiceId: mongoose.Types.ObjectId;
    clientId: mongoose.Types.ObjectId;
    domainName: string;
    registrar?: string;
    years: number;
    currency: string;
    renewedFrom: Date;
    renewedUntil: Date;
    status: ProvisioningJobStatus;
    attempts: number;
    maxAttempts: number;
    idempotencyKey: string;
    lockedAt?: Date;
    lockOwner?: string;
    lastError?: string;
    completedAt?: Date;
    manualResolvedAt?: Date;
    manualResolvedBy?: mongoose.Types.ObjectId;
    manualResolutionNote?: string;
    registrarTransactionId?: string;
    resolutionSource?: 'auto' | 'manual' | 'registrar_sync';
    createdAt: Date;
    updatedAt: Date;
}

const domainRenewalJobSchema = new Schema<IDomainRenewalJob>(
    {
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true, index: true },
        domainDetailsId: { type: Schema.Types.ObjectId, ref: 'DomainServiceDetails', required: true, index: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        domainName: { type: String, required: true, trim: true, lowercase: true, index: true },
        registrar: { type: String, trim: true },
        years: { type: Number, required: true, min: 1, max: 10 },
        currency: { type: String, required: true, trim: true },
        renewedFrom: { type: Date, required: true },
        renewedUntil: { type: Date, required: true },
        status: {
            type: String,
            enum: Object.values(ProvisioningJobStatus),
            default: ProvisioningJobStatus.QUEUED,
            required: true,
            index: true,
        },
        attempts: { type: Number, default: 0, required: true },
        maxAttempts: { type: Number, default: 3, required: true },
        idempotencyKey: { type: String, required: true, unique: true },
        lockedAt: { type: Date },
        lockOwner: { type: String },
        lastError: { type: String },
        completedAt: { type: Date },
        manualResolvedAt: { type: Date },
        manualResolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        manualResolutionNote: { type: String },
        registrarTransactionId: { type: String, trim: true },
        resolutionSource: { type: String, enum: ['auto', 'manual', 'registrar_sync'], default: 'auto' },
    },
    { timestamps: true }
);

domainRenewalJobSchema.index({ status: 1, lockedAt: 1, attempts: 1 });
domainRenewalJobSchema.index({ serviceId: 1, invoiceId: 1 }, { unique: true });

const DomainRenewalJob = mongoose.model<IDomainRenewalJob>('DomainRenewalJob', domainRenewalJobSchema);
export default DomainRenewalJob;

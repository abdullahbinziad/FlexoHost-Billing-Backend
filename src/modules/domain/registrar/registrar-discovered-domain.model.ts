import mongoose, { Schema } from 'mongoose';

export interface IRegistrarDiscoveredDomainDocument extends mongoose.Document {
    domainName: string;
    registrar: string;
    registrarStatus?: string;
    expiresAt?: Date;
    nameservers: string[];
    registrarLock?: boolean;
    syncStatus?: 'success' | 'failure' | 'pending';
    syncMessage?: string;
    source: 'registrar_reconcile';
    lastDetectedAt: Date;
    importedAt?: Date;
    lastRegistrarSyncAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const registrarDiscoveredDomainSchema = new Schema<IRegistrarDiscoveredDomainDocument>(
    {
        domainName: { type: String, required: true, trim: true, lowercase: true },
        registrar: { type: String, required: true, trim: true, lowercase: true },
        registrarStatus: { type: String },
        expiresAt: { type: Date },
        nameservers: { type: [String], default: [] },
        registrarLock: { type: Boolean },
        syncStatus: {
            type: String,
            enum: ['success', 'failure', 'pending'],
            default: 'pending',
        },
        syncMessage: { type: String },
        source: {
            type: String,
            enum: ['registrar_reconcile'],
            default: 'registrar_reconcile',
        },
        lastDetectedAt: { type: Date, default: Date.now },
        importedAt: { type: Date },
        lastRegistrarSyncAt: { type: Date },
    },
    {
        timestamps: true,
    }
);

registrarDiscoveredDomainSchema.index({ registrar: 1, domainName: 1 }, { unique: true });
registrarDiscoveredDomainSchema.index({ lastDetectedAt: -1 });

const RegistrarDiscoveredDomain = mongoose.models.RegistrarDiscoveredDomain
    || mongoose.model<IRegistrarDiscoveredDomainDocument>('RegistrarDiscoveredDomain', registrarDiscoveredDomainSchema);

export default RegistrarDiscoveredDomain;

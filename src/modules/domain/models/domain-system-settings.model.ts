import mongoose, { Schema, Document } from 'mongoose';

export interface IDomainSystemSettings extends Document {
    key: string;
    /** Normalized registrar key (e.g. dynadot, namely) when TLD has no provider */
    defaultRegistrarKey: string;
    nameserver1: string;
    nameserver2: string;
    nameserver3: string;
    nameserver4: string;
    updatedBy?: mongoose.Types.ObjectId;
}

const domainSystemSettingsSchema = new Schema<IDomainSystemSettings>(
    {
        key: { type: String, default: 'global', unique: true },
        defaultRegistrarKey: { type: String, default: 'dynadot' },
        nameserver1: { type: String, default: '' },
        nameserver2: { type: String, default: '' },
        nameserver3: { type: String, default: '' },
        nameserver4: { type: String, default: '' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

export const DEFAULT_DOMAIN_SYSTEM_SETTINGS = {
    defaultRegistrarKey: 'dynadot',
    nameserver1: '',
    nameserver2: '',
    nameserver3: '',
    nameserver4: '',
};

export default mongoose.model<IDomainSystemSettings>('DomainSystemSettings', domainSystemSettingsSchema);

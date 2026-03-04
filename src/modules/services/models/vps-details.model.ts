import mongoose, { Schema, Document } from 'mongoose';

export interface IVpsServiceDetails extends Document {
    serviceId: mongoose.Types.ObjectId;
    provider: string;
    region: string;
    plan: {
        cpuCores: number;
        ramMb: number;
        diskGb: number;
    };
    osImage: string;
    ipAddresses: string[];
    instanceRemoteId?: string;
    credentialSecretId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const vpsServiceDetailsSchema = new Schema<IVpsServiceDetails>({
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true, unique: true },
    provider: { type: String, required: true },
    region: { type: String, required: true },
    plan: {
        cpuCores: { type: Number, required: true },
        ramMb: { type: Number, required: true },
        diskGb: { type: Number, required: true },
    },
    osImage: { type: String, required: true },
    ipAddresses: { type: [String], default: [] },
    instanceRemoteId: { type: String },
    credentialSecretId: { type: String, select: false }, // Never return safely hidden strings
}, { timestamps: true });

const VpsServiceDetails = mongoose.model<IVpsServiceDetails>('VpsServiceDetails', vpsServiceDetailsSchema);
export default VpsServiceDetails;

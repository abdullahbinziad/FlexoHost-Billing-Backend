import mongoose, { Schema, Document } from 'mongoose';

export enum ControlPanelType {
    CPANEL = 'CPANEL',
    DIRECTADMIN = 'DIRECTADMIN',
    PLESK = 'PLESK',
    CUSTOM = 'CUSTOM',
}

export interface IHostingServiceDetails extends Document {
    serviceId: mongoose.Types.ObjectId;
    primaryDomain: string;
    serverId?: mongoose.Types.ObjectId | string;
    serverLocation?: string;
    controlPanel: ControlPanelType;
    packageId: string;
    accountUsername?: string;
    accountRemoteId?: string;
    assignedIp?: string;
    nameservers: string[];
    resourceLimits: {
        diskMb: number;
        bandwidthMb: number;
        inodeLimit: number;
        cpuLimit?: number;
        ramMb?: number;
    };
    sslEnabled: boolean;
    dedicatedIp: boolean;
    credentialSecretId?: string;
    /** Cached disk/bandwidth usage from WHM; updated on refresh or by usage-sync scheduler. */
    usageSnapshot?: {
        diskUsedMb: number;
        diskLimitMb: number;
        bandwidthUsedMb: number;
        bandwidthLimitMb: number;
        updatedAt: Date;
    };
    createdAt: Date;
    updatedAt: Date;
}

const hostingServiceDetailsSchema = new Schema<IHostingServiceDetails>({
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true, unique: true },
    primaryDomain: { type: String, required: true },
    serverId: { type: Schema.Types.Mixed },
    serverLocation: { type: String },
    controlPanel: { type: String, enum: Object.values(ControlPanelType), required: true },
    packageId: { type: String, required: true },
    accountUsername: { type: String },
    accountRemoteId: { type: String },
    assignedIp: { type: String },
    nameservers: { type: [String], default: [] },
    resourceLimits: {
        diskMb: { type: Number, required: true },
        bandwidthMb: { type: Number, required: true },
        inodeLimit: { type: Number, required: true },
        cpuLimit: { type: Number },
        ramMb: { type: Number },
    },
    sslEnabled: { type: Boolean, default: false },
    dedicatedIp: { type: Boolean, default: false },
    credentialSecretId: { type: String, select: false }, // Never return raw credentials reference
    usageSnapshot: {
        diskUsedMb: { type: Number },
        diskLimitMb: { type: Number },
        bandwidthUsedMb: { type: Number },
        bandwidthLimitMb: { type: Number },
        updatedAt: { type: Date },
    },
}, { timestamps: true });

const HostingServiceDetails = mongoose.model<IHostingServiceDetails>('HostingServiceDetails', hostingServiceDetailsSchema);
export default HostingServiceDetails;

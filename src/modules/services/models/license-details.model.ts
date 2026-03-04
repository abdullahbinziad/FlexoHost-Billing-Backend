import mongoose, { Schema, Document } from 'mongoose';

export interface ILicenseServiceDetails extends Document {
    serviceId: mongoose.Types.ObjectId;
    productName: string;
    licenseKeyEncrypted?: string;
    licenseKeyHash?: string;
    displayLast4?: string;
    activationLimit: number;
    activationsUsed: number;
    expiresAt?: Date;
    entitlements: string[];
    licenseRemoteId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const licenseServiceDetailsSchema = new Schema<ILicenseServiceDetails>({
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true, unique: true },
    productName: { type: String, required: true },
    licenseKeyEncrypted: { type: String, select: false }, // never plain
    licenseKeyHash: { type: String, select: false },
    displayLast4: { type: String },
    activationLimit: { type: Number, required: true, default: 1 },
    activationsUsed: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date },
    entitlements: { type: [String], default: [] },
    licenseRemoteId: { type: String },
}, { timestamps: true });

// Custom Validation: Require either encrypted or hash
licenseServiceDetailsSchema.pre('validate', function (next) {
    if (!this.licenseKeyEncrypted && !this.licenseKeyHash) {
        this.invalidate('licenseKeyEncrypted', 'Either licenseKeyEncrypted or licenseKeyHash is required');
    }
    next();
});

const LicenseServiceDetails = mongoose.model<ILicenseServiceDetails>('LicenseServiceDetails', licenseServiceDetailsSchema);
export default LicenseServiceDetails;

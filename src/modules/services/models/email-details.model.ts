import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailServiceDetails extends Document {
    serviceId: mongoose.Types.ObjectId;
    domain: string;
    provider: string;
    mailboxCount: number;
    mailboxes: string[];
    mxConfigured: boolean;
    subscriptionRemoteId?: string;
    tenantRemoteId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const emailServiceDetailsSchema = new Schema<IEmailServiceDetails>({
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true, unique: true },
    domain: { type: String, required: true },
    provider: { type: String, required: true },
    mailboxCount: { type: Number, required: true, default: 0 },
    mailboxes: { type: [String], default: [] }, // identifiers only, never passwords
    mxConfigured: { type: Boolean, default: false },
    subscriptionRemoteId: { type: String },
    tenantRemoteId: { type: String },
}, { timestamps: true });

const EmailServiceDetails = mongoose.model<IEmailServiceDetails>('EmailServiceDetails', emailServiceDetailsSchema);
export default EmailServiceDetails;

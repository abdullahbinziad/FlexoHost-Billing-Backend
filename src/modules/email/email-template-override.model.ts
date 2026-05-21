import mongoose, { Schema, Document } from 'mongoose';
import type { TemplateKey } from './templates/types';

export interface IEmailTemplateOverride extends Document {
    templateKey: TemplateKey;
    enabled: boolean;
    subject?: string;
    previewText?: string;
    html?: string;
    text?: string;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const emailTemplateOverrideSchema = new Schema<IEmailTemplateOverride>(
    {
        templateKey: { type: String, required: true, unique: true, index: true },
        enabled: { type: Boolean, default: true, index: true },
        subject: { type: String, trim: true, maxlength: 300 },
        previewText: { type: String, trim: true, maxlength: 500 },
        html: { type: String, maxlength: 100000 },
        text: { type: String, maxlength: 20000 },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

const EmailTemplateOverride = mongoose.model<IEmailTemplateOverride>('EmailTemplateOverride', emailTemplateOverrideSchema);
export default EmailTemplateOverride;

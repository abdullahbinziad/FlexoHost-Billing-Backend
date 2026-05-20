import mongoose, { Schema, Document } from 'mongoose';

export type EmailLogSource = 'manual' | 'system' | 'cron' | 'webhook';
export type EmailLogStatus = 'queued' | 'sent' | 'failed';

export interface IEmailLog extends Document {
    clientId?: mongoose.Types.ObjectId;
    serviceId?: mongoose.Types.ObjectId;
    invoiceId?: mongoose.Types.ObjectId;
    domainId?: mongoose.Types.ObjectId;
    orderId?: mongoose.Types.ObjectId;
    ticketId?: mongoose.Types.ObjectId;
    sentBy?: mongoose.Types.ObjectId;
    actorType: 'system' | 'user';
    source: EmailLogSource;
    status: EmailLogStatus;
    to: string;
    from?: string;
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    subject: string;
    templateKey?: string;
    emailType?: string;
    bodyPreview?: string;
    providerMessageId?: string;
    error?: string;
    meta?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const emailLogSchema = new Schema<IEmailLog>(
    {
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', index: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
        domainId: { type: Schema.Types.ObjectId, index: true },
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
        ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', index: true },
        sentBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        actorType: { type: String, enum: ['system', 'user'], default: 'system', index: true },
        source: { type: String, enum: ['manual', 'system', 'cron', 'webhook'], required: true, index: true },
        status: { type: String, enum: ['queued', 'sent', 'failed'], required: true, index: true },
        to: { type: String, required: true, trim: true, index: true },
        from: { type: String, trim: true },
        cc: [{ type: String, trim: true }],
        bcc: [{ type: String, trim: true }],
        replyTo: { type: String, trim: true },
        subject: { type: String, required: true, trim: true },
        templateKey: { type: String, trim: true, index: true },
        emailType: { type: String, trim: true, index: true },
        bodyPreview: { type: String, trim: true },
        providerMessageId: { type: String, trim: true, index: true },
        error: { type: String, trim: true },
        meta: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

emailLogSchema.index({ clientId: 1, createdAt: -1 });
emailLogSchema.index({ serviceId: 1, createdAt: -1 });
emailLogSchema.index({ status: 1, createdAt: -1 });
emailLogSchema.index({ source: 1, createdAt: -1 });

const EmailLog = mongoose.model<IEmailLog>('EmailLog', emailLogSchema);
export default EmailLog;

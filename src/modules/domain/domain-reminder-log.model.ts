import mongoose, { Schema, Document } from 'mongoose';

export interface IDomainReminderLog extends Document {
    domainDetailsId: mongoose.Types.ObjectId;
    /** e.g. DOMAIN_EXPIRY_90, DOMAIN_EXPIRY_30 */
    reminderType: string;
    sentAt: Date;
}

const domainReminderLogSchema = new Schema<IDomainReminderLog>(
    {
        domainDetailsId: { type: Schema.Types.ObjectId, ref: 'DomainServiceDetails', required: true },
        reminderType: { type: String, required: true },
        sentAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

domainReminderLogSchema.index({ domainDetailsId: 1, reminderType: 1 }, { unique: true });

export default mongoose.model<IDomainReminderLog>('DomainReminderLog', domainReminderLogSchema);

import mongoose, { Schema, Document } from 'mongoose';

export enum ReminderType {
    PRE_REMINDER_7_DAYS = 'PRE_REMINDER_7_DAYS',
    DUE_TODAY = 'DUE_TODAY',
    OVERDUE_3_DAYS = 'OVERDUE_3_DAYS',
    OVERDUE_7_DAYS = 'OVERDUE_7_DAYS',
    OVERDUE_14_DAYS = 'OVERDUE_14_DAYS',
}

export interface IInvoiceReminderLog extends Document {
    invoiceId: mongoose.Types.ObjectId;
    reminderType: ReminderType;
    sentAt: Date;
}

const invoiceReminderLogSchema = new Schema<IInvoiceReminderLog>(
    {
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
        reminderType: { type: String, enum: Object.values(ReminderType), required: true },
        sentAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

// Unique compound index to ensure idempotency (each type is sent exactly once per invoice)
invoiceReminderLogSchema.index({ invoiceId: 1, reminderType: 1 }, { unique: true });

export default mongoose.model<IInvoiceReminderLog>('InvoiceReminderLog', invoiceReminderLogSchema);

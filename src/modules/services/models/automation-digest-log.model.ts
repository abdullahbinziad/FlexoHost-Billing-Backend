import mongoose, { Schema } from 'mongoose';

export interface IAutomationDigestLogDocument extends mongoose.Document {
    taskKey: string;
    periodStart: Date;
    periodEnd: Date;
    recipientCount: number;
    sentAt: Date;
    meta?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const automationDigestLogSchema = new Schema<IAutomationDigestLogDocument>(
    {
        taskKey: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        periodStart: {
            type: Date,
            required: true,
        },
        periodEnd: {
            type: Date,
            required: true,
        },
        recipientCount: {
            type: Number,
            required: true,
            default: 0,
        },
        sentAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        meta: {
            type: Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
    }
);

automationDigestLogSchema.index({ taskKey: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

const AutomationDigestLog = mongoose.models.AutomationDigestLog
    || mongoose.model<IAutomationDigestLogDocument>('AutomationDigestLog', automationDigestLogSchema);

export default AutomationDigestLog;

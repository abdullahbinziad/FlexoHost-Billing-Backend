import mongoose, { Schema } from 'mongoose';

export interface IAutomationAlertStateDocument extends mongoose.Document {
    taskKey: string;
    consecutiveFailures: number;
    firstFailureAt?: Date;
    lastFailureAt?: Date;
    lastFailureMessage?: string;
    lastAlertedFailureCount: number;
    lastAlertedAt?: Date;
    alertOpen: boolean;
    lastSuccessAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const automationAlertStateSchema = new Schema<IAutomationAlertStateDocument>(
    {
        taskKey: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        consecutiveFailures: {
            type: Number,
            default: 0,
        },
        firstFailureAt: {
            type: Date,
        },
        lastFailureAt: {
            type: Date,
        },
        lastFailureMessage: {
            type: String,
            trim: true,
        },
        lastAlertedFailureCount: {
            type: Number,
            default: 0,
        },
        lastAlertedAt: {
            type: Date,
        },
        alertOpen: {
            type: Boolean,
            default: false,
        },
        lastSuccessAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

const AutomationAlertState = mongoose.models.AutomationAlertState
    || mongoose.model<IAutomationAlertStateDocument>('AutomationAlertState', automationAlertStateSchema);

export default AutomationAlertState;

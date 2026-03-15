import mongoose, { Schema } from 'mongoose';

export interface IAutomationTaskLockDocument extends mongoose.Document {
    taskKey: string;
    ownerId: string;
    lockedUntil: Date;
    lastStartedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const automationTaskLockSchema = new Schema<IAutomationTaskLockDocument>(
    {
        taskKey: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        ownerId: {
            type: String,
            required: true,
            trim: true,
        },
        lockedUntil: {
            type: Date,
            required: true,
            index: true,
        },
        lastStartedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

const AutomationTaskLock = mongoose.models.AutomationTaskLock
    || mongoose.model<IAutomationTaskLockDocument>('AutomationTaskLock', automationTaskLockSchema);

export default AutomationTaskLock;

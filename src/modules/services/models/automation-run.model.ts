import mongoose, { Schema } from 'mongoose';

export type AutomationRunSource = 'cron' | 'manual';
export type AutomationRunStatus = 'running' | 'success' | 'failure';

export interface IAutomationRunDocument extends mongoose.Document {
    taskKey: string;
    taskLabel: string;
    category: string;
    source: AutomationRunSource;
    status: AutomationRunStatus;
    startedAt: Date;
    completedAt?: Date;
    durationMs?: number;
    result?: Record<string, unknown>;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}

const automationRunSchema = new Schema<IAutomationRunDocument>(
    {
        taskKey: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        taskLabel: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        source: {
            type: String,
            enum: ['cron', 'manual'],
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['running', 'success', 'failure'],
            required: true,
            index: true,
        },
        startedAt: {
            type: Date,
            required: true,
            index: true,
        },
        completedAt: {
            type: Date,
        },
        durationMs: {
            type: Number,
        },
        result: {
            type: Schema.Types.Mixed,
        },
        errorMessage: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

automationRunSchema.index({ taskKey: 1, startedAt: -1 });
automationRunSchema.index({ status: 1, startedAt: -1 });

const AutomationRun = mongoose.models.AutomationRun
    || mongoose.model<IAutomationRunDocument>('AutomationRun', automationRunSchema);

export default AutomationRun;

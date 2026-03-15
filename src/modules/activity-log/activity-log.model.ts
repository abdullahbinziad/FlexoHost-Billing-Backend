import mongoose, { Schema } from 'mongoose';
import { IActivityLogDocument, IActivityLogModel } from './activity-log.interface';

const categoryEnum = [
    'invoice', 'payment', 'order', 'service', 'affiliate', 'domain', 'ticket', 'auth', 'email',
    'cron', 'suspension', 'usage', 'backup', 'settings', 'automation', 'other',
];

const activityLogSchema = new Schema<IActivityLogDocument, IActivityLogModel>(
    {
        message: { type: String, required: true, trim: true },
        type: { type: String, trim: true, index: true },
        category: { type: String, enum: categoryEnum, index: true },
        actorType: { type: String, enum: ['system', 'user'], required: true, default: 'system', index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        targetType: { type: String, trim: true, index: true },
        targetId: { type: Schema.Types.ObjectId, index: true },
        source: { type: String, enum: ['manual', 'system', 'cron', 'webhook'], index: true },
        status: { type: String, enum: ['success', 'failure', 'pending'], index: true },
        severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], index: true },
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service', index: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
        domainId: { type: Schema.Types.ObjectId, index: true },
        ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', index: true },
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
        ipAddress: { type: String, trim: true, index: true },
        userAgent: { type: String, trim: true },
        meta: { type: Schema.Types.Mixed },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ type: 1, createdAt: -1 });
activityLogSchema.index({ clientId: 1, createdAt: -1 });

const ActivityLog = mongoose.model<IActivityLogDocument, IActivityLogModel>('ActivityLog', activityLogSchema);
export default ActivityLog;

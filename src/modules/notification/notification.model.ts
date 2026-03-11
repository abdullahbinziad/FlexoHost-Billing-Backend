import mongoose, { Schema } from 'mongoose';
import {
    INotificationDocument,
    INotificationModel,
    NotificationCategory,
} from './notification.interface';

const notificationSchema = new Schema<INotificationDocument, INotificationModel>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            index: true,
        },
        category: {
            type: String,
            enum: ['billing', 'service', 'support', 'security'] satisfies NotificationCategory[],
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        read: {
            type: Boolean,
            default: false,
            index: true,
        },
        readAt: {
            type: Date,
        },
        linkPath: {
            type: String,
        },
        linkLabel: {
            type: String,
        },
        meta: {
            type: Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
    }
);

const Notification = mongoose.model<INotificationDocument, INotificationModel>(
    'Notification',
    notificationSchema
);

export default Notification;


import { Document, Model, Types } from 'mongoose';

export type NotificationCategory = 'billing' | 'service' | 'support' | 'security';

export interface INotification {
    userId: Types.ObjectId;
    clientId?: Types.ObjectId;
    category: NotificationCategory;
    title: string;
    message: string;
    read: boolean;
    readAt?: Date;
    linkPath?: string;
    linkLabel?: string;
    meta?: Record<string, any>;
}

export interface INotificationDocument extends INotification, Document {}

export interface INotificationModel extends Model<INotificationDocument> {}


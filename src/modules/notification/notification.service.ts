import Notification from './notification.model';
import { NotificationCategory } from './notification.interface';
import mongoose from 'mongoose';

interface CreateNotificationInput {
    userId: mongoose.Types.ObjectId;
    clientId?: mongoose.Types.ObjectId;
    category: NotificationCategory;
    title: string;
    message: string;
    linkPath?: string;
    linkLabel?: string;
    meta?: Record<string, any>;
}

class NotificationService {
    async create(input: CreateNotificationInput) {
        return Notification.create({
            ...input,
            read: false,
        });
    }

    async markAsRead(id: string, userId: string) {
        return Notification.findOneAndUpdate(
            { _id: id, userId },
            { read: true, readAt: new Date() },
            { new: true }
        );
    }

    async markAllAsRead(userId: string) {
        await Notification.updateMany(
            { userId, read: false },
            { $set: { read: true, readAt: new Date() } }
        );
    }
}

export default new NotificationService();


import Notification from './notification.model';
import { NotificationCategory } from './notification.interface';
import mongoose from 'mongoose';
import User from '../user/user.model';

const STAFF_ROLES = ['admin', 'staff', 'superadmin'] as const;

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

interface CreateForAdminStaffInput {
    category: NotificationCategory;
    title: string;
    message: string;
    linkPath?: string;
    linkLabel?: string;
    clientId?: mongoose.Types.ObjectId;
    meta?: Record<string, any>;
}

class NotificationService {
    async create(input: CreateNotificationInput) {
        return Notification.create({
            ...input,
            read: false,
        });
    }

    /**
     * Create in-app notifications for all admin/staff/superadmin users.
     * Reusable for ticket opened, client reply, or any admin-facing event.
     */
    async createForAdminStaff(input: CreateForAdminStaffInput): Promise<number> {
        const staffUsers = await User.find({
            role: { $in: STAFF_ROLES },
            active: true,
        })
            .select('_id')
            .lean()
            .exec();

        if (staffUsers.length === 0) return 0;

        const notifications = staffUsers.map((u) => ({
            userId: u._id,
            clientId: input.clientId,
            category: input.category,
            title: input.title,
            message: input.message,
            linkPath: input.linkPath,
            linkLabel: input.linkLabel,
            meta: input.meta,
            read: false,
        }));

        await Notification.insertMany(notifications);
        return notifications.length;
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


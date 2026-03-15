import { Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import Notification from './notification.model';
import { getPagination, buildSort } from '../../utils/pagination';
import { AuthRequest } from '../../middlewares/auth';

class NotificationController {
    getNotifications = catchAsync(async (req: AuthRequest, res: Response) => {
        const { page, limit, read, category } = req.query as {
            page?: string;
            limit?: string;
            read?: string;
            category?: string;
        };
        const userId = req.user?._id;

        if (!userId) {
            return ApiResponse.unauthorized(res);
        }

        const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });
        const sort = buildSort('createdAt', 'desc');

        const filter: Record<string, any> = { userId };
        if (read === 'true') filter.read = true;
        else if (read === 'false') filter.read = false;
        if (category && ['billing', 'service', 'support', 'security'].includes(category)) {
            filter.category = category;
        }

        const [results, totalResults, unreadCount] = await Promise.all([
            Notification.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            Notification.countDocuments(filter),
            Notification.countDocuments({ userId, read: false }),
        ]);

        const totalPages = Math.ceil(totalResults / safeLimit || 1);

        return ApiResponse.ok(res, 'Notifications retrieved', {
            results,
            page: safePage,
            limit: safeLimit,
            totalPages,
            totalResults,
            unreadCount,
        });
    });

    markAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const userId = req.user?._id;

        if (!userId) {
            return ApiResponse.unauthorized(res);
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: id, userId },
            { read: true, readAt: new Date() },
            { new: true }
        );

        if (!notification) {
            return ApiResponse.notFound(res, 'Notification not found');
        }

        return ApiResponse.ok(res, 'Notification marked as read', notification);
    });

    markAllAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
        const userId = req.user?._id;

        if (!userId) {
            return ApiResponse.unauthorized(res);
        }

        await Notification.updateMany(
            { userId, read: false },
            { $set: { read: true, readAt: new Date() } }
        );

        return ApiResponse.ok(res, 'All notifications marked as read');
    });

    deleteNotification = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const userId = req.user?._id;

        if (!userId) {
            return ApiResponse.unauthorized(res);
        }

        const deleted = await Notification.findOneAndDelete({ _id: id, userId });

        if (!deleted) {
            return ApiResponse.notFound(res, 'Notification not found');
        }

        return ApiResponse.ok(res, 'Notification deleted', { id });
    });

    deleteAllRead = catchAsync(async (req: AuthRequest, res: Response) => {
        const userId = req.user?._id;

        if (!userId) {
            return ApiResponse.unauthorized(res);
        }

        const result = await Notification.deleteMany({ userId, read: true });

        return ApiResponse.ok(res, 'Read notifications deleted', {
            deletedCount: result.deletedCount,
        });
    });
}

export default new NotificationController();


import { Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import Notification from './notification.model';
import { getPagination, buildSort } from '../../utils/pagination';
import { AuthRequest } from '../../middlewares/auth';

class NotificationController {
    getNotifications = catchAsync(async (req: AuthRequest, res: Response) => {
        const { page, limit } = req.query as { page?: string; limit?: string };
        const userId = req.user?._id;

        if (!userId) {
            return ApiResponse.unauthorized(res);
        }

        const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });
        const sort = buildSort('createdAt', 'desc');

        const [results, totalResults, unreadCount] = await Promise.all([
            Notification.find({ userId })
                .sort(sort)
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            Notification.countDocuments({ userId }),
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
}

export default new NotificationController();


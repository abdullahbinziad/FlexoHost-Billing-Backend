import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import { getActivityLogs } from './activity-log.service';

export const activityLogController = {
    getActivityLog: catchAsync(async (req: Request, res: Response) => {
        const filters = {
            search: req.query.search as string,
            clientId: req.query.clientId as string,
            userId: req.query.userId as string,
            actorType: req.query.actorType as 'system' | 'user',
            category: req.query.category as import('./activity-log.interface').ActivityCategory,
            type: req.query.type as string,
            source: req.query.source as string,
            severity: req.query.severity as string,
            invoiceId: req.query.invoiceId as string,
            serviceId: req.query.serviceId as string,
            ticketId: req.query.ticketId as string,
            dateFrom: req.query.dateFrom as string,
            dateTo: req.query.dateTo as string,
        };
        const options = {
            page: Number(req.query.page) || 1,
            limit: Math.min(Number(req.query.limit) || 100, 500),
            sortBy: (req.query.sortBy as string) || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
        };
        const result = await getActivityLogs(filters, options);
        return ApiResponse.ok(res, 'Activity log retrieved', result);
    }),
};

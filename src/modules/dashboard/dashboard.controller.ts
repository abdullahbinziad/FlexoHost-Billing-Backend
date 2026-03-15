import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import { getDailyActionDetails, getDailyActionsStats } from './dashboard.service';
import ApiError from '../../utils/apiError';

export const dashboardController = {
    getDailyActions: catchAsync(async (req: Request, res: Response) => {
        const stats = await getDailyActionsStats(
            req.query.dateFrom as string | undefined,
            req.query.dateTo as string | undefined
        );
        return ApiResponse.ok(res, 'Daily actions retrieved', stats);
    }),
    getDailyActionDetails: catchAsync(async (req: Request, res: Response) => {
        const type = req.query.type as 'invoices' | 'creditCardCharges' | 'inactiveTickets' | undefined;
        if (!type || !['invoices', 'creditCardCharges', 'inactiveTickets'].includes(type)) {
            throw ApiError.badRequest('Unsupported daily action detail type');
        }
        const details = await getDailyActionDetails(
            type,
            req.query.dateFrom as string | undefined,
            req.query.dateTo as string | undefined
        );
        return ApiResponse.ok(res, 'Daily action details retrieved', details);
    }),
};

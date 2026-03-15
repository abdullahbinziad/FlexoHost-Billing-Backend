import { Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import PaymentTransaction from './transaction.model';
import { getPagination, buildSort } from '../../utils/pagination';
import { getEffectiveClientId } from '../client-access-grant/effective-client';
import { AuthRequest } from '../../middlewares/auth';

class TransactionController {
    getTransactions = catchAsync(async (req: AuthRequest, res: Response) => {
        const { page, limit, status, gateway, clientId } = req.query as {
            page?: string;
            limit?: string;
            status?: string;
            gateway?: string;
            clientId?: string;
        };

        const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });

        const filters: any = {};
        if (status) {
            filters.status = status;
        }
        if (gateway) {
            filters.gateway = gateway;
        }

        // Admin/staff/superadmin: allow explicit clientId filter or see all
        // Client/user: use effective client (own or acting-as with orders area)
        if (req.user && ['admin', 'staff', 'superadmin'].includes(req.user.role)) {
            if (clientId) {
                filters.clientId = clientId;
            }
        } else if (req.user) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'orders');
            if (!effectiveClientId) return;
            filters.clientId = effectiveClientId;
        }

        const sort = buildSort('createdAt', 'desc');

        const [results, totalResults] = await Promise.all([
            PaymentTransaction.find(filters)
                .sort(sort)
                .skip(skip)
                .limit(safeLimit)
                .populate('invoiceId', 'invoiceNumber billedTo currency')
                .lean(),
            PaymentTransaction.countDocuments(filters),
        ]);

        const totalPages = Math.ceil(totalResults / safeLimit || 1);

        return ApiResponse.ok(res, 'Transactions retrieved', {
            results,
            page: safePage,
            limit: safeLimit,
            totalPages,
            totalResults,
        });
    });
}

export default new TransactionController();


import { Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import PaymentTransaction from './transaction.model';
import { getPagination, buildSort } from '../../utils/pagination';
import Client from '../client/client.model';
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

        // If admin/staff, allow explicit clientId filter
        // If client/user, always scope to their own client record
        if (req.user && (req.user.role === 'admin' || req.user.role === 'staff')) {
            if (clientId) {
                filters.clientId = clientId;
            }
        } else if (req.user) {
            const client = await Client.findOne({ user: req.user._id }).select('_id');
            if (!client) {
                return ApiResponse.ok(res, 'Transactions retrieved', {
                    results: [],
                    page: safePage,
                    limit: safeLimit,
                    totalPages: 1,
                    totalResults: 0,
                });
            }
            filters.clientId = client._id;
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


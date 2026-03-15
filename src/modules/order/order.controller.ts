import { Request, Response } from 'express';
import { orderService } from './order.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { AuthRequest } from '../../middlewares/auth';
import { getEffectiveClientId } from '../client-access-grant/effective-client';

export class OrderController {
    /** Get order/checkout config: server locations, payment methods, supported currencies (for admin new order) */
    getOrderConfig = catchAsync(async (_req: Request, res: Response) => {
        const config = await orderService.getOrderConfig();
        return ApiResponse.success(res, 200, 'Order config retrieved', config);
    });

    createOrder = catchAsync(async (req: Request, res: Response) => {
        const user = (req as AuthRequest).user!;
        const currentUserId = user._id?.toString?.() ?? user.id;
        const isAdmin = ['admin', 'superadmin', 'staff'].includes(user.role);
        const payload = req.body;
        const orderResult = await orderService.createOrder(payload, currentUserId, isAdmin);

        ApiResponse.created(res, 'Order created successfully. Redirecting to payment...', {
            order: orderResult,
            invoiceId: (orderResult as any).invoiceId
        });
    });

    getOrders = catchAsync(async (req: Request, res: Response) => {
        const user = (req as AuthRequest).user!;
        const filter: any = {};
        const isAdmin = ['admin', 'superadmin', 'staff'].includes(user.role);
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

        if (!isAdmin) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'orders');
            if (effectiveClientId === null) return;
            filter.clientId = effectiveClientId;
        } else {
            if (req.query.userId) filter.userId = req.query.userId;
            const clientId = req.query.clientId as string | undefined;
            if (clientId) filter.clientId = clientId;
        }

        if (req.query.search) filter.search = req.query.search;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

        const orders = await orderService.getOrders(filter, { page, limit });
        ApiResponse.success(res, 200, 'Orders retrieved successfully', orders);
    });

    getOrder = catchAsync(async (req: Request, res: Response) => {
        const orderId = req.params.id;
        const order = await orderService.getOrder(orderId);

        if (!order) {
            return ApiResponse.error(res, 404, 'Order not found');
        }

        const user = (req as AuthRequest).user!;
        if (!['admin', 'superadmin', 'staff'].includes(user.role)) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'orders');
            if (effectiveClientId === null) return;
            const orderClientId = (order as any).clientId?.toString?.();
            if (orderClientId !== effectiveClientId) {
                return ApiResponse.error(res, 403, 'Unauthorized access to order');
            }
        }

        return ApiResponse.success(res, 200, 'Order retrieved successfully', order);
    });

    updateOrderStatus = catchAsync(async (req: Request, res: Response) => {
        const orderId = req.params.id;
        const user = (req as AuthRequest).user!;
        if (!['admin', 'superadmin', 'staff'].includes(user.role)) {
            return ApiResponse.error(res, 403, 'Only staff can update order status');
        }
        const { status } = req.body as { status: string };
        if (!status) {
            return ApiResponse.error(res, 400, 'Status is required');
        }
        const validStatuses = Object.values(OrderStatus);
        if (!validStatuses.includes(status as OrderStatus)) {
            return ApiResponse.error(res, 400, `Invalid status. Use one of: ${validStatuses.join(', ')}`);
        }
        const updated = await orderService.updateOrderStatus(orderId, status as OrderStatus);
        return ApiResponse.success(res, 200, 'Order status updated', updated);
    });

    runModuleCreate = catchAsync(async (req: Request, res: Response) => {
        const orderId = req.params.id;
        const user = (req as AuthRequest).user!;
        if (!['admin', 'superadmin', 'staff'].includes(user.role)) {
            return ApiResponse.error(res, 403, 'Only staff can run module create');
        }
        const body = req.body as { items: Array<{ itemIndex: number; orderItemId?: string; serverId?: string; whmPackage?: string; username?: string; password?: string; runModuleCreate?: boolean; sendWelcomeEmail?: boolean }> };
        const result = await orderService.runModuleCreate(orderId, body, user.id);
        return ApiResponse.success(res, 200, 'Run module create completed', result);
    });

    bulkAcceptOrders = catchAsync(async (req: Request, res: Response) => {
        const { orderIds } = req.body as { orderIds: string[] };
        const result = await orderService.bulkAcceptOrders(orderIds);
        return ApiResponse.success(res, 200, `Accepted ${result.updated} of ${result.total} order(s)`, result);
    });

    bulkCancelOrders = catchAsync(async (req: Request, res: Response) => {
        const { orderIds } = req.body as { orderIds: string[] };
        const result = await orderService.bulkCancelOrders(orderIds);
        return ApiResponse.success(res, 200, `Cancelled ${result.updated} of ${result.total} order(s)`, result);
    });

    bulkDeleteOrders = catchAsync(async (req: Request, res: Response) => {
        const { orderIds } = req.body as { orderIds: string[] };
        const result = await orderService.bulkDeleteOrders(orderIds);
        return ApiResponse.success(res, 200, `Deleted ${result.deleted} of ${result.total} order(s)`, result);
    });

    bulkSendMessage = catchAsync(async (req: Request, res: Response) => {
        const user = (req as AuthRequest).user!;
        const { orderIds, subject, message } = req.body as { orderIds: string[]; subject: string; message: string };
        const result = await orderService.bulkSendMessage(
            orderIds,
            subject,
            message,
            user._id?.toString?.() ?? user.id
        );
        return ApiResponse.success(res, 200, `Sent to ${result.sent} of ${result.total} client(s)`, result);
    });
}

export const orderController = new OrderController();
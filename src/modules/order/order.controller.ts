import { Request, Response } from 'express';
import { orderService } from './order.service';
import { OrderStatus } from './order.interface';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { AuthRequest } from '../../middlewares/auth';

export class OrderController {
    createOrder = catchAsync(async (req: Request, res: Response) => {
        const currentUserId = (req as AuthRequest).user?.id;
        const payload = req.body;
        const orderResult = await orderService.createOrder(payload, currentUserId);

        ApiResponse.created(res, 'Order created successfully. Redirecting to payment...', {
            order: orderResult,
            invoiceId: (orderResult as any).invoiceId
        });
    });

    getOrders = catchAsync(async (req: Request, res: Response) => {
        const user = (req as AuthRequest).user!;
        const clientId = req.query.clientId as string | undefined;

        const filter: any = {};

        const isAdmin = ['admin', 'superadmin', 'staff'].includes(user.role);

        if (!isAdmin) {
            filter.userId = user.id;
        } else if (req.query.userId) {
            filter.userId = req.query.userId;
        }

        if (clientId) {
            filter.clientId = clientId;
        }

        const orders = await orderService.getOrders(filter);
        ApiResponse.success(res, 200, 'Orders retrieved successfully', orders);
    });

    getOrder = catchAsync(async (req: Request, res: Response) => {
        const orderId = req.params.id;
        const order = await orderService.getOrder(orderId);

        if (!order) {
            return ApiResponse.error(res, 404, 'Order not found');
        }

        // Check if user owns the order (using userId field)
        const orderUserId = order.userId?.toString();
        const requestUserId = (req as AuthRequest).user!.id;

        if (orderUserId !== requestUserId &&
            !['admin', 'superadmin', 'staff'].includes((req as AuthRequest).user!.role)) {
            return ApiResponse.error(res, 403, 'Unauthorized access to order');
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
        ApiResponse.success(res, 200, 'Run module create completed', result);
    });
}

export const orderController = new OrderController();
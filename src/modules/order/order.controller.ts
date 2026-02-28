import { Request, Response } from 'express';
import { orderService } from './order.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { AuthRequest } from '../../middlewares/auth';

export class OrderController {
    createOrder = catchAsync(async (req: Request, res: Response) => {
        // `req.user` might be null if it's a new account registration during checkout
        // So we'll pass `req.user?.id` to the service, and let the service handle client identity
        const currentUserId = (req as AuthRequest).user?.id;

        // Pass the entire structured payload to the service
        const payload = req.body;

        const order = await orderService.createOrder(payload, currentUserId);

        ApiResponse.created(res, 'Order created successfully. Redirecting to payment...', order);
    });

    getOrders = catchAsync(async (req: Request, res: Response) => {
        const userId = (req as AuthRequest).user!.id;
        const orders = await orderService.getOrders(userId);

        ApiResponse.success(res, 200, 'Orders retrieved successfully', orders);
    });

    getOrder = catchAsync(async (req: Request, res: Response) => {
        const orderId = req.params.id;
        const order = await orderService.getOrder(orderId);

        if (!order) {
            return ApiResponse.error(res, 404, 'Order not found');
        }

        // Check if user owns the order
        if (order.userId.toString() !== (req as AuthRequest).user!.id && (req as AuthRequest).user!.role !== 'admin') {
            return ApiResponse.error(res, 403, 'Unauthorized access to order');
        }

        return ApiResponse.success(res, 200, 'Order retrieved successfully', order);
    });
}

export const orderController = new OrderController();

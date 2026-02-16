import { Request, Response } from 'express';
import { orderService } from './order.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { AuthRequest } from '../../middlewares/auth';

export class OrderController {
    createOrder = catchAsync(async (req: Request, res: Response) => {
        const userId = (req as AuthRequest).user!.id; // Cast to AuthRequest
        const { items, paymentMethod, currency } = req.body;

        const order = await orderService.createOrder(userId, items, paymentMethod, currency);

        ApiResponse.created(res, 'Order created successfully', order);
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

import { Request, Response } from 'express';
import { serviceService } from './service.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { AuthRequest } from '../../middlewares/auth';

export class ServiceController {
    getServices = catchAsync(async (req: Request, res: Response) => {
        const userId = (req as AuthRequest).user!.id;
        const services = await serviceService.getServices(userId);

        return ApiResponse.success(res, 200, 'Services retrieved successfully', services);
    });

    getService = catchAsync(async (req: Request, res: Response) => {
        const serviceId = req.params.id;
        const service = await serviceService.getService(serviceId);

        if (!service) {
            return ApiResponse.error(res, 404, 'Service not found');
        }

        // Check ownership or permission
        const userId = (req as AuthRequest).user!.id;
        const userRole = (req as AuthRequest).user!.role;

        const isOwner = service.userId.toString() === userId;
        const hasPermission = service.permissions?.some(p => p.userId.toString() === userId);
        const isAdmin = userRole === 'admin' || userRole === 'superadmin';

        if (!isOwner && !isAdmin && !hasPermission) {
            return ApiResponse.error(res, 403, 'Unauthorized access to service');
        }

        return ApiResponse.success(res, 200, 'Service retrieved successfully', service);
    });
}

export const serviceController = new ServiceController();

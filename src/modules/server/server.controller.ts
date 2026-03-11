import { Request, Response } from 'express';
import { serverService } from './server.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { AuthRequest } from '../../middlewares/auth';

class ServerController {
    create = catchAsync(async (req: Request, res: Response) => {
        const userId = (req as AuthRequest).user?._id?.toString();
        const server = await serverService.createServer(req.body, userId);
        return ApiResponse.created(res, 'Server added successfully', server);
    });

    getAll = catchAsync(async (req: Request, res: Response) => {
        const servers = await serverService.getServers(req.query);
        return ApiResponse.success(res, 200, 'Servers retrieved successfully', servers);
    });

    getOne = catchAsync(async (req: Request, res: Response) => {
        const server = await serverService.getServerById(req.params.id);
        if (!server) {
            return ApiResponse.error(res, 404, 'Server not found');
        }
        return ApiResponse.success(res, 200, 'Server details retrieved', server);
    });

    update = catchAsync(async (req: Request, res: Response) => {
        const server = await serverService.updateServer(req.params.id, req.body);
        if (!server) {
            return ApiResponse.error(res, 404, 'Server not found');
        }
        return ApiResponse.success(res, 200, 'Server updated successfully', server);
    });

    delete = catchAsync(async (req: Request, res: Response) => {
        const server = await serverService.deleteServer(req.params.id);
        if (!server) {
            return ApiResponse.error(res, 404, 'Server not found');
        }
        return ApiResponse.success(res, 200, 'Server deleted successfully', null);
    });

    testConnection = catchAsync(async (req: Request, res: Response) => {
        const result = await serverService.testWhmConnection(req.params.id);
        if (result.success) {
            return ApiResponse.success(res, 200, 'Connection successful', result);
        }
        return ApiResponse.error(res, 400, result.error || 'Connection failed', result);
    });

    getPackages = catchAsync(async (req: Request, res: Response) => {
        const { packages, error } = await serverService.listWhmPackages(req.params.id);
        if (error) {
            return ApiResponse.error(res, 400, error, { packages: [] });
        }
        return ApiResponse.success(res, 200, 'Packages retrieved', { packages });
    });
}

export const serverController = new ServerController();

import { Request, Response } from 'express';
import { serverService } from './server.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { AuthRequest } from '../../middlewares/auth';
import { auditLogSafe } from '../activity-log/activity-log.service';

class ServerController {
    create = catchAsync(async (req: Request, res: Response) => {
        const userId = (req as AuthRequest).user?._id?.toString();
        const server = await serverService.createServer(req.body, userId);
        auditLogSafe({
            message: `Server created: ${(server as any).name ?? (server as any).hostname ?? server._id}`,
            type: 'server_created',
            category: 'settings',
            actorType: userId ? 'user' : 'system',
            actorId: userId,
            source: 'manual',
            targetType: 'server',
            targetId: (server as any)._id?.toString?.(),
        });
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
        const userId = (req as AuthRequest).user?._id?.toString();
        auditLogSafe({
            message: `Server updated: ${(server as any).name ?? req.params.id}`,
            type: 'server_changed',
            category: 'settings',
            actorType: userId ? 'user' : 'system',
            actorId: userId,
            source: 'manual',
            targetType: 'server',
            targetId: req.params.id,
        });
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

    syncAccounts = catchAsync(async (req: Request, res: Response) => {
        const result = await serverService.syncAccountCount(req.params.id);
        if ('error' in result) {
            return ApiResponse.error(res, 400, result.error, null);
        }
        return ApiResponse.success(res, 200, 'Account count synced', result);
    });
}

export const serverController = new ServerController();

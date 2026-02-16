import { Request, Response } from 'express';
import { serverService } from './server.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';

class ServerController {
    create = catchAsync(async (req: Request, res: Response) => {
        const server = await serverService.createServer(req.body);
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
}

export const serverController = new ServerController();

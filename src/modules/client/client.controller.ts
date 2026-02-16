import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import clientService from './client.service';

class ClientController {
    // Register a new client
    registerClient = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await clientService.registerClient(req.body);

        return ApiResponse.created(res, result.message, {
            client: result.client,
            isNewUser: result.isNewUser,
        });
    });

    // Get all clients (admin/staff only)
    getAllClients = catchAsync(async (req: AuthRequest, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const filters = {
            companyName: req.query.companyName as string,
            firstName: req.query.firstName as string,
            lastName: req.query.lastName as string,
        };

        const result = await clientService.getAllClients(page, limit, filters);

        return ApiResponse.ok(res, 'Clients retrieved successfully', result);
    });

    // Get client by ID
    getClientById = catchAsync(async (req: AuthRequest, res: Response) => {
        const client = await clientService.getClientById(req.params.id);

        return ApiResponse.ok(res, 'Client retrieved successfully', { client });
    });

    // Get client by clientId (auto-increment number)
    getClientByClientId = catchAsync(async (req: AuthRequest, res: Response) => {
        const clientId = parseInt(req.params.clientId);
        const client = await clientService.getClientByClientId(clientId);

        return ApiResponse.ok(res, 'Client retrieved successfully', { client });
    });

    // Get current client profile (for logged-in client)
    getMyProfile = catchAsync(async (req: AuthRequest, res: Response) => {
        const client = await clientService.getClientByUserId(req.user._id.toString());

        return ApiResponse.ok(res, 'Client profile retrieved successfully', { client });
    });

    // Update client profile
    updateClient = catchAsync(async (req: AuthRequest, res: Response) => {
        const client = await clientService.updateClient(req.params.id, req.body);

        return ApiResponse.ok(res, 'Client updated successfully', { client });
    });

    // Update own profile (for logged-in client)
    updateMyProfile = catchAsync(async (req: AuthRequest, res: Response) => {
        const currentClient = await clientService.getClientByUserId(req.user._id.toString());
        const client = await clientService.updateClient(currentClient._id.toString(), req.body);

        return ApiResponse.ok(res, 'Profile updated successfully', { client });
    });

    // Delete client (soft delete)
    deleteClient = catchAsync(async (req: AuthRequest, res: Response) => {
        await clientService.deleteClient(req.params.id);

        return ApiResponse.ok(res, 'Client deleted successfully');
    });

    // Permanently delete client
    permanentlyDeleteClient = catchAsync(async (req: AuthRequest, res: Response) => {
        await clientService.permanentlyDeleteClient(req.params.id);

        return ApiResponse.ok(res, 'Client permanently deleted');
    });
}

export default new ClientController();

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
            search: req.query.search as string,
            supportPin: req.query.supportPin as string,
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

    // Get current client's support PIN (generate if missing)
    getMySupportPin = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await clientService.getOrCreateSupportPinForUser(req.user._id.toString());
        return ApiResponse.ok(res, 'Support PIN retrieved successfully', result);
    });

    // Regenerate current client's support PIN
    regenerateMySupportPin = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await clientService.regenerateSupportPinForUser(req.user._id.toString());
        return ApiResponse.ok(res, 'Support PIN regenerated successfully', result);
    });

    // Regenerate support PIN for a specific client (admin/staff)
    regenerateSupportPinForClient = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const result = await clientService.regenerateSupportPinForClient(id);
        return ApiResponse.ok(res, 'Support PIN regenerated successfully for client', result);
    });

    // Get current client profile (for logged-in client)
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

    // Complete profile (post–social signup: company, phone, address)
    completeProfile = catchAsync(async (req: AuthRequest, res: Response) => {
        const client = await clientService.completeProfile(req.user._id.toString(), req.body);
        return ApiResponse.ok(res, 'Profile completed successfully', { client });
    });

    // Verify support PIN (admin/staff: search client by PIN)
    verifySupportPin = catchAsync(async (req: AuthRequest, res: Response) => {
        const { pin } = req.body as { pin: string };
        if (!pin || typeof pin !== 'string' || pin.length !== 6) {
            return ApiResponse.badRequest(res, 'A valid 6-digit support PIN is required');
        }

        const client = await clientService.findClientBySupportPin(pin);
        return ApiResponse.ok(res, 'Support PIN verified successfully', { client });
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

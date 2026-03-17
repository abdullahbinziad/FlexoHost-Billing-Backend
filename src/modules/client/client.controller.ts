import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import ApiError from '../../utils/apiError';
import config from '../../config';
import clientService from './client.service';
import { requireClientAccess } from '../client-access-grant/require-client-access';
import emailService from '../email/email.service';
import { buildCustomEmailHtml } from '../email/build-custom-email';
import { auditLogSafe } from '../activity-log/activity-log.service';

const baseCookieOptions = {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax' as const,
};

class ClientController {
    // Register a new client (returns tokens for auto-login)
    registerClient = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await clientService.registerClient(req.body);

        if (result.accessToken && result.refreshToken) {
            res.cookie('jwt', result.accessToken, {
                ...baseCookieOptions,
                maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
            });
            res.cookie('refreshToken', result.refreshToken, {
                ...baseCookieOptions,
                maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
            });
        }

        return ApiResponse.created(res, result.message, {
            client: result.client,
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
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

    // Get another client's profile when "acting as" them (grantee). Requires grant access. Frontend also uses this to validate rehydrated acting-as.
    getClientProfileActingAs = catchAsync(async (req: AuthRequest, res: Response) => {
        const access = await requireClientAccess(req, res, req.params.clientId);
        if (!access) return;
        const client = await clientService.getClientById(req.params.clientId);
        const payload: { client: any; accessAreas?: { invoices: boolean; tickets: boolean; orders: boolean } } = { client };
        if (access.allowInvoices !== undefined) {
            payload.accessAreas = {
                invoices: access.allowInvoices !== false,
                tickets: access.allowTickets !== false,
                orders: access.allowOrders !== false,
            };
        }
        return ApiResponse.ok(res, 'Client profile retrieved successfully', payload);
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

    sendClientEmail = catchAsync(async (req: AuthRequest, res: Response) => {
        const client = await clientService.getClientById(req.params.id);
        const subject = String(req.body.subject || '').trim();
        const message = String(req.body.message || '').trim();
        const recipientEmail = client.contactEmail || client.user?.email;

        if (!recipientEmail) {
            throw ApiError.badRequest('This client does not have an email address');
        }

        const clientName = [client.firstName, client.lastName].filter(Boolean).join(' ').trim() || 'Client';
        const senderLabel = req.user?.email || 'Support Team';
        const result = await emailService.sendEmail({
            to: recipientEmail,
            subject,
            text: message,
            html: buildCustomEmailHtml({ clientName, message, senderLabel }),
        });

        const bodyPreview = message.length > 500 ? `${message.slice(0, 500)}...` : message;
        auditLogSafe({
            message: result.success ? `Custom email sent to ${clientName}` : `Failed to send custom email to ${clientName}`,
            type: result.success ? 'email_sent' : 'email_failed',
            category: 'email',
            actorType: 'user',
            actorId: req.user?._id?.toString?.(),
            source: 'manual',
            status: result.success ? 'success' : 'failure',
            clientId: req.params.id,
            targetType: 'client',
            targetId: req.params.id,
            meta: {
                emailType: 'custom',
                subject,
                to: recipientEmail,
                bodyPreview,
                error: result.success ? undefined : result.error,
            },
        });

        if (!result.success) {
            return ApiResponse.badRequest(res, result.error || 'Failed to send email');
        }

        return ApiResponse.ok(res, 'Email sent successfully', {
            to: recipientEmail,
            subject,
        });
    });

    // Allowed client update fields - prevent mass assignment (user, supportPin, etc.)
    private static readonly ALLOWED_CLIENT_UPDATE = [
        'firstName', 'lastName', 'companyName', 'contactEmail', 'phoneNumber', 'avatar', 'address',
    ];

    // Get current client profile (for logged-in client)
    // Update client profile
    updateClient = catchAsync(async (req: AuthRequest, res: Response) => {
        const body = req.body as Record<string, unknown>;
        const updates = Object.fromEntries(
            Object.entries(body).filter(([k]) => ClientController.ALLOWED_CLIENT_UPDATE.includes(k))
        );
        const client = await clientService.updateClient(req.params.id, updates as any);

        return ApiResponse.ok(res, 'Client updated successfully', { client });
    });

    // Update own profile (for logged-in client)
    updateMyProfile = catchAsync(async (req: AuthRequest, res: Response) => {
        const currentClient = await clientService.getClientByUserId(req.user._id.toString());
        const body = req.body as Record<string, unknown>;
        const updates = Object.fromEntries(
            Object.entries(body).filter(([k]) => ClientController.ALLOWED_CLIENT_UPDATE.includes(k))
        );
        const client = await clientService.updateClient(currentClient._id.toString(), updates as any);

        return ApiResponse.ok(res, 'Profile updated successfully', { client });
    });

    // Complete profile (post–social signup: company, phone, address)
    completeProfile = catchAsync(async (req: AuthRequest, res: Response) => {
        const body = req.body as Record<string, unknown>;
        const updates = Object.fromEntries(
            Object.entries(body).filter(([k]) => ClientController.ALLOWED_CLIENT_UPDATE.includes(k))
        );
        const client = await clientService.completeProfile(req.user._id.toString(), updates as any);
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

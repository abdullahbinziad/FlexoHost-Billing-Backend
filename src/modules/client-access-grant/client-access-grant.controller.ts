import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import { clientAccessGrantService } from './client-access-grant.service';
import { getClientIdForUser } from '../client/client.helpers';
import type { AuthRequest } from '../../middlewares/auth';

/** Create grant (owner only). POST /clients/:clientId/access-grants */
export const createGrant = catchAsync(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const user = (req as AuthRequest).user;
    if (!user) return ApiResponse.error(res, 401, 'Unauthorized');
    const userClientId = await getClientIdForUser(user);
    if (!['admin', 'superadmin', 'staff'].includes(user.role) && userClientId !== clientId)
        return ApiResponse.error(res, 403, 'Only the client owner can create grants');
    const { granteeEmail, scope, serviceType, serviceIds, permissions, expiresAt, allowInvoices, allowTickets, allowOrders } = req.body || {};
    const grant = await clientAccessGrantService.create({
        clientId,
        createdByUserId: user._id.toString(),
        granteeEmail,
        scope,
        serviceType,
        serviceIds,
        permissions: Array.isArray(permissions) ? permissions : ['view'],
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        allowInvoices,
        allowTickets,
        allowOrders,
    });
    return ApiResponse.created(res, 'Grant created', grant);
});

/** List grants for a client (owner only). GET /clients/:clientId/access-grants */
export const listGrantsForClient = catchAsync(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const user = (req as AuthRequest).user;
    if (!user) return ApiResponse.error(res, 401, 'Unauthorized');
    const userClientId = await getClientIdForUser(user);
    if (!['admin', 'superadmin', 'staff'].includes(user.role) && userClientId !== clientId)
        return ApiResponse.error(res, 403, 'Only the client owner can list grants');
    const grants = await clientAccessGrantService.listByClient(clientId);
    return ApiResponse.ok(res, 'Grants retrieved', grants);
});

/** Update grant (owner only). PATCH /clients/:clientId/access-grants/:grantId */
export const updateGrant = catchAsync(async (req: Request, res: Response) => {
    const { clientId, grantId } = req.params;
    const user = (req as AuthRequest).user;
    if (!user) return ApiResponse.error(res, 401, 'Unauthorized');
    const userClientId = await getClientIdForUser(user);
    if (!['admin', 'superadmin', 'staff'].includes(user.role) && userClientId !== clientId)
        return ApiResponse.error(res, 403, 'Only the client owner can update grants');
    const { scope, serviceType, serviceIds, permissions, expiresAt, allowInvoices, allowTickets, allowOrders } = req.body || {};
    const grant = await clientAccessGrantService.update(grantId, clientId, user._id.toString(), {
        scope,
        serviceType,
        serviceIds,
        permissions: Array.isArray(permissions) ? permissions : undefined,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
        allowInvoices,
        allowTickets,
        allowOrders,
    });
    return ApiResponse.ok(res, 'Grant updated', grant);
});

/** Revoke grant (owner only). DELETE /clients/:clientId/access-grants/:grantId */
export const revokeGrant = catchAsync(async (req: Request, res: Response) => {
    const { clientId, grantId } = req.params;
    const user = (req as AuthRequest).user;
    if (!user) return ApiResponse.error(res, 401, 'Unauthorized');
    const userClientId = await getClientIdForUser(user);
    if (!['admin', 'superadmin', 'staff'].includes(user.role) && userClientId !== clientId)
        return ApiResponse.error(res, 403, 'Only the client owner can revoke grants');
    await clientAccessGrantService.revoke(grantId, clientId, user._id.toString());
    return ApiResponse.ok(res, 'Grant revoked');
});

/** List grants shared with me (grants where I am grantee). GET /clients/me/access-grants */
export const listGrantsSharedWithMe = catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    if (!user) return ApiResponse.error(res, 401, 'Unauthorized');
    const grants = await clientAccessGrantService.listByGrantee(user._id.toString());
    return ApiResponse.ok(res, 'Grants shared with you', grants);
});

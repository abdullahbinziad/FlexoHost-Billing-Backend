import { Request, Response } from 'express';
import { getClientIdForUser } from '../client/client.helpers';
import { clientAccessGrantService } from './client-access-grant.service';

export type ClientAccessArea = 'invoices' | 'tickets' | 'orders';

export interface ClientAccessContext {
    clientId: string;
    /** When user is grantee: filter to apply when listing services. */
    grantFilter?: { serviceIds?: string[]; types?: string[] };
    /** When user is grantee: which areas are allowed (omitted = owner/admin = all allowed). */
    allowInvoices?: boolean;
    allowTickets?: boolean;
    allowOrders?: boolean;
}

export interface RequireClientAccessOptions {
    serviceId?: string;
    requiredPermission?: 'view' | 'manage';
    /** When set, for grantee access the grant must allow this area (invoices/tickets/orders). */
    area?: ClientAccessArea;
}

/**
 * Ensures the request user is authenticated and has access to the given clientId
 * (as owner, admin/staff, or grantee with required permission).
 * Sends 401/403 and returns null on failure; returns context on success.
 */
export async function requireClientAccess(
    req: Request,
    res: Response,
    clientId: string,
    options?: RequireClientAccessOptions
): Promise<ClientAccessContext | null> {
    const user: any = (req as any).user;
    if (!user) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return null;
    }

    const userClientId = await getClientIdForUser(user);
    if (['admin', 'superadmin', 'staff'].includes(user.role)) return { clientId };
    if (userClientId === clientId) return { clientId };

    const access = await clientAccessGrantService.checkAccess(user._id.toString(), clientId, {
        serviceId: options?.serviceId,
        requiredPermission: options?.requiredPermission,
    });
    if (!access.allowed) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return null;
    }

    if (options?.area && access.isGrantee) {
        const areaAllowed =
            options.area === 'invoices' ? access.allowInvoices !== false :
            options.area === 'tickets' ? access.allowTickets !== false :
            options.area === 'orders' ? access.allowOrders !== false : true;
        if (!areaAllowed) {
            res.status(403).json({ success: false, message: 'Access to this area is not granted' });
            return null;
        }
    }

    const grantFilter = await clientAccessGrantService.getServiceFilterForGrantee(user._id.toString(), clientId);
    return {
        clientId,
        grantFilter: grantFilter || undefined,
        allowInvoices: access.allowInvoices,
        allowTickets: access.allowTickets,
        allowOrders: access.allowOrders,
    };
}

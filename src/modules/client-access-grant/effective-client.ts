import { Request, Response } from 'express';
import { getClientIdForUser } from '../client/client.helpers';
import { requireClientAccess } from './require-client-access';
import type { ClientAccessArea } from './require-client-access';

/**
 * Returns the "effective" client ID for this request:
 * - If X-Acting-As header is set: validates grant access (and optional area) and returns that clientId (or null and sends 403).
 * - Otherwise: returns the current user's client ID (from profile).
 * When area is provided, grantee must have that area allowed (invoices/tickets/orders).
 */
export async function getEffectiveClientId(req: Request, res: Response, area?: ClientAccessArea): Promise<string | null> {
    const user: any = (req as any).user;
    if (!user) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return null;
    }

    const actingAs = (req.headers['x-acting-as'] as string)?.trim();
    if (actingAs) {
        const access = await requireClientAccess(req, res, actingAs, area ? { area } : undefined);
        if (!access) return null;
        (req as any).grantFilter = access.grantFilter;
        return access.clientId;
    }

    return getClientIdForUser(user);
}

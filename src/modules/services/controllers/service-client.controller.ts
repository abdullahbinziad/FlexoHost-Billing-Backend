import { Request, Response } from 'express';
import serviceClientService from '../services/service-client.service';
import { ServiceType } from '../types/enums';
import Client from '../../client/client.model';

/** Resolve clientId for the current user (from Client collection if not on user). */
async function getClientIdForUser(user: any): Promise<string | null> {
    if (user.clientId) return user.clientId.toString();
    const client = await Client.findOne({ user: user._id }).select('_id').lean();
    return client ? (client._id as any).toString() : null;
}

export const getClientServices = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId } = req.params;
        const type = req.query.type as ServiceType;
        const status = req.query.status as any;
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;

        // Verify the authenticated user can access this clientId
        // Assuming req.user is populated by auth middleware
        // Typically: if (req.user.clientId !== clientId && req.user.role !== 'admin') throw 403
        // Implementing basic check assuming req.user exists
        const user: any = (req as any).user;
        if (!user) {
            res.status(403).json({ success: false, message: 'Unauthorized access to client services' });
            return;
        }
        const userClientId = await getClientIdForUser(user);
        if (!['admin', 'superadmin', 'staff'].includes(user.role) && (userClientId !== clientId || !userClientId)) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }

        const data = await serviceClientService.listServices(clientId, type, status, page, limit);
        res.status(200).json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getClientServiceById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;

        const user: any = (req as any).user;
        if (!user) {
            res.status(403).json({ success: false, message: 'Unauthorized access' });
            return;
        }
        const userClientId = await getClientIdForUser(user);
        if (!['admin', 'superadmin', 'staff'].includes(user.role) && (userClientId !== clientId || !userClientId)) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }

        const data = await serviceClientService.getServiceWithDetails(clientId, serviceId);

        if (!data) {
            res.status(404).json({ success: false, message: 'Service not found or unauthorized' });
            return;
        }

        res.status(200).json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** One-click login URL for cPanel (client or admin). */
export const getCpanelLoginUrl = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;
        const user: any = (req as any).user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const userClientId = await getClientIdForUser(user);
        if (!['admin', 'superadmin', 'staff'].includes(user.role) && userClientId !== clientId) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }
        const result = await serviceClientService.getHostingLoginUrl(clientId, serviceId, 'cpanel');
        if ('error' in result) {
            res.status(400).json({ success: false, message: result.error });
            return;
        }
        res.status(200).json({ success: true, url: result.url });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** One-click login URL for Webmail (client or admin). */
export const getWebmailLoginUrl = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;
        const user: any = (req as any).user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const userClientId = await getClientIdForUser(user);
        if (!['admin', 'superadmin', 'staff'].includes(user.role) && userClientId !== clientId) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }
        const result = await serviceClientService.getHostingLoginUrl(clientId, serviceId, 'webmail');
        if ('error' in result) {
            res.status(400).json({ success: false, message: result.error });
            return;
        }
        res.status(200).json({ success: true, url: result.url });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

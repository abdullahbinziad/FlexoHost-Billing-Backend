import { Request, Response } from 'express';
import serviceClientService from '../services/service-client.service';
import { ServiceType } from '../types/enums';

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
        if (!user || (!user.clientId && user.role !== 'admin')) {
            res.status(403).json({ success: false, message: 'Unauthorized access to client services' });
            return;
        }

        // Also check if non-admin is accessing someone else's client record
        if (user.role !== 'admin' && user.clientId && user.clientId.toString() !== clientId) {
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
        if (!user || (!user.clientId && user.role !== 'admin')) {
            res.status(403).json({ success: false, message: 'Unauthorized access' });
            return;
        }
        if (user.role !== 'admin' && user.clientId && user.clientId.toString() !== clientId) {
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

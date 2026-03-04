import { Request, Response } from 'express';
import serviceAdminService from '../services/service-admin.service';
import { ServiceAdminAction } from '../models/service-audit-log.model';

export const performServiceAction = async (req: Request, res: Response, action: ServiceAdminAction): Promise<void> => {
    try {
        const { serviceId } = req.params;
        const user: any = (req as any).user;

        if (!user || user.role !== 'admin') {
            res.status(403).json({ success: false, message: 'Admin permissions required' });
            return;
        }

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const data = await serviceAdminService.performAction(serviceId, action, user._id, ip, userAgent);

        res.status(200).json({ success: true, data, message: `Action ${action} performed successfully.` });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const suspendService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.SUSPEND);
export const unsuspendService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.UNSUSPEND);
export const terminateService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.TERMINATE);
export const retryProvisionService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.RETRY_PROVISION);

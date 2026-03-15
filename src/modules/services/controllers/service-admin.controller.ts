import { Request, Response } from 'express';
import serviceAdminService from '../services/service-admin.service';
import { ServiceAdminAction } from '../models/service-audit-log.model';

export const performServiceAction = async (req: Request, res: Response, action: ServiceAdminAction): Promise<void> => {
    try {
        const { serviceId } = req.params;
        const user: any = (req as any).user;

        if (!user || !['admin', 'superadmin', 'staff'].includes(user.role)) {
            res.status(403).json({ success: false, message: 'Admin permissions required' });
            return;
        }

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const extra = action === 'CHANGE_PACKAGE' ? { plan: (req.body as any)?.plan } : undefined;
        const data = await serviceAdminService.performAction(serviceId, action, user._id, ip, userAgent, extra);

        res.status(200).json({ success: true, data, message: `Action ${action} performed successfully.` });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const suspendService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.SUSPEND);
export const unsuspendService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.UNSUSPEND);
export const terminateService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.TERMINATE);
export const changePackageService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.CHANGE_PACKAGE);
export const retryProvisionService = (req: Request, res: Response) => performServiceAction(req, res, ServiceAdminAction.RETRY_PROVISION);

export const updateServiceAdminNotes = async (req: Request, res: Response): Promise<void> => {
    try {
        const { serviceId } = req.params;
        const user: any = (req as any).user;

        if (!user || !['admin', 'superadmin', 'staff'].includes(user.role)) {
            res.status(403).json({ success: false, message: 'Admin permissions required' });
            return;
        }

        const adminNotes = typeof (req.body as any)?.adminNotes === 'string' ? (req.body as any).adminNotes : '';
        const data = await serviceAdminService.updateAdminNotes(serviceId, adminNotes);

        res.status(200).json({ success: true, data, message: 'Admin notes updated successfully.' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateServiceAutomation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { serviceId } = req.params;
        const user: any = (req as any).user;

        if (!user || !['admin', 'superadmin', 'staff'].includes(user.role)) {
            res.status(403).json({ success: false, message: 'Admin permissions required' });
            return;
        }

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const body = (req.body || {}) as { autoSuspendAt?: string | null; autoTerminateAt?: string | null };
        const data = await serviceAdminService.updateAutomationSchedule(serviceId, user._id, body, ip, userAgent);

        res.status(200).json({ success: true, data, message: 'Service automation schedule updated successfully.' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

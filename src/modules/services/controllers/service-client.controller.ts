import { Request, Response } from 'express';
import serviceClientService from '../core/service-client.service';
import { ServiceType } from '../types/enums';
import { requireClientAccess } from '../../client-access-grant/require-client-access';

export const getClientServices = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId } = req.params;
        const access = await requireClientAccess(req, res, clientId);
        if (!access) return;
        const type = req.query.type as ServiceType;
        const status = req.query.status as any;
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const data = await serviceClientService.listServices(access.clientId, {
            type,
            status,
            page,
            limit,
            serviceIds: access.grantFilter?.serviceIds,
            types: access.grantFilter?.types,
        });
        res.status(200).json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getClientServiceById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;
        const access = await requireClientAccess(req, res, clientId, { serviceId, requiredPermission: 'view' });
        if (!access) return;
        const data = await serviceClientService.getServiceWithDetails(access.clientId, serviceId);
        if (!data) {
            res.status(404).json({ success: false, message: 'Service not found or unauthorized' });
            return;
        }
        res.status(200).json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** List available cPanel shortcuts for this hosting service (from WHM get_users_links). */
export const getCpanelShortcuts = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;
        const access = await requireClientAccess(req, res, clientId, { serviceId, requiredPermission: 'view' });
        if (!access) return;
        const result = await serviceClientService.getHostingShortcuts(access.clientId, serviceId);
        if ('error' in result) {
            res.status(400).json({ success: false, message: result.error });
            return;
        }
        res.status(200).json({ success: true, shortcuts: result.shortcuts });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** One-click login URL for a shortcut. Verifies appkey in get_users_links before create_user_session. */
export const getShortcutLoginUrl = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId, shortcutKey } = req.params;
        const access = await requireClientAccess(req, res, clientId, { serviceId, requiredPermission: 'view' });
        if (!access) return;
        const result = await serviceClientService.getHostingLoginUrl(access.clientId, serviceId, shortcutKey);
        if ('error' in result) {
            const isNotFound = result.error === 'Unknown shortcut' || result.error?.includes('not available');
            res.status(isNotFound ? 404 : 400).json({ success: false, message: result.error });
            return;
        }
        res.status(200).json({ success: true, url: result.url });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Create an email mailbox for this hosting service (cPanel). Body: { email: string, password: string }. */
export const createHostingEmailAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;
        const access = await requireClientAccess(req, res, clientId, { serviceId, requiredPermission: 'manage' });
        if (!access) return;
        const { email: emailLocalPart, password } = req.body || {};
        const result = await serviceClientService.createHostingEmailAccount(
            access.clientId,
            serviceId,
            emailLocalPart,
            password
        );
        if ('error' in result) {
            res.status(400).json({ success: false, message: result.error });
            return;
        }
        const { auditLogSafe } = await import('../../activity-log/activity-log.service');
        const userId = (req as any).user?._id?.toString?.();
        auditLogSafe({
            message: `Email account created: ${result.email}`,
            type: 'email_account_created',
            category: 'service',
            actorType: userId ? 'user' : 'system',
            actorId: userId,
            source: 'manual',
            targetType: 'service',
            targetId: serviceId,
            clientId: access.clientId,
            serviceId,
            meta: { email: result.email } as Record<string, unknown>,
        });
        res.status(201).json({ success: true, email: result.email });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Disk/bandwidth usage from DB (usageSnapshot). No WHM call on read. */
export const getHostingUsage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;
        const access = await requireClientAccess(req, res, clientId, { serviceId, requiredPermission: 'view' });
        if (!access) return;
        const result = await serviceClientService.getHostingUsage(access.clientId, serviceId);
        if ('error' in result) {
            res.status(400).json({ success: false, message: result.error });
            return;
        }
        res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Refresh usage from WHM, save to DB, return updated usage. Used by Reload button. */
export const refreshHostingUsage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId, serviceId } = req.params;
        const access = await requireClientAccess(req, res, clientId, { serviceId, requiredPermission: 'manage' });
        if (!access) return;
        const result = await serviceClientService.refreshHostingUsage(access.clientId, serviceId);
        if ('error' in result) {
            res.status(400).json({ success: false, message: result.error });
            return;
        }
        res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

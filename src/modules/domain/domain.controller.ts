import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import ApiError from '../../utils/apiError';
import domainService from './domain.service';
import { getEffectiveClientId } from '../client-access-grant/effective-client';
import registrarConfigService from './registrar/registrar-config.service';
import { auditLogSafe } from '../activity-log/activity-log.service';
import type { AuthRequest } from '../../middlewares/auth';
import {
    getDomainSystemSettingsForAdmin,
    updateDomainSystemSettings,
    type DomainSystemSettingsDto,
} from './domain-system-settings.service';
import { getRegistrarProvider, normalizeRegistrarKey } from './registrar/registrar-registry';

class DomainController {
    private getRequestedClientIdForStaff(req: Request): string | undefined {
        const role = (req as any).user?.role;
        const isStaff = role === 'admin' || role === 'staff' || role === 'superadmin';
        const requestedClientId = typeof req.query.clientId === 'string' ? req.query.clientId.trim() : '';
        return isStaff && requestedClientId ? requestedClientId : undefined;
    }

    private async assertDomainAccess(req: Request, res: Response, domain: string): Promise<string | null> {
        const role = (req as any).user?.role;
        const isStaff = role === 'admin' || role === 'staff' || role === 'superadmin';
        const requestedClientId = this.getRequestedClientIdForStaff(req);
        const clientId = requestedClientId || await getEffectiveClientId(req, res);
        if (!clientId) return null;
        const owned = await domainService.getDomainServiceForClient(clientId, domain);
        if (!owned && !isStaff) {
            res.status(403).json({ success: false, message: 'You do not have access to this domain' });
            return null;
        }
        if (!owned && isStaff && requestedClientId) {
            res.status(404).json({ success: false, message: 'Domain not found for the selected client' });
            return null;
        }
        return clientId;
    }

    /** List domains for the effective client (own or acting-as). GET /domains */
    listMyDomains = catchAsync(async (req: Request, res: Response) => {
        const clientId = await getEffectiveClientId(req, res);
        if (!clientId) return;
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const result = await domainService.listDomainsByClientId(clientId, { page, limit });
        return ApiResponse.ok(res, 'Domains retrieved', result);
    });

    /** Admin/staff: list domains for a specific client. GET /domains/admin/client/:clientId */
    listDomainsByClientAdmin = catchAsync(async (req: Request, res: Response) => {
        const { clientId } = req.params;
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const result = await domainService.listDomainsByClientId(clientId, { page, limit });
        return ApiResponse.ok(res, 'Client domains retrieved', result);
    });

    /** Admin/staff: list all billable domains across clients. GET /domains/admin/inventory */
    listAllDomainsAdmin = catchAsync(async (req: Request, res: Response) => {
        const result = await domainService.listAllDomainsAdmin({
            search: typeof req.query.search === 'string' ? req.query.search : undefined,
            registrar: typeof req.query.registrar === 'string' ? req.query.registrar : undefined,
            serviceStatus: typeof req.query.serviceStatus === 'string' ? req.query.serviceStatus : undefined,
            transferStatus: typeof req.query.transferStatus === 'string' ? req.query.transferStatus : undefined,
            syncState: typeof req.query.syncState === 'string' ? req.query.syncState : undefined,
            source: typeof req.query.source === 'string' ? req.query.source : undefined,
            sortBy: typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined,
            sortOrder: req.query.sortOrder === 'asc' ? 'asc' : 'desc',
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 20,
        });
        return ApiResponse.ok(res, 'Admin domain inventory retrieved', result);
    });

    searchDomain = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.query;
        if (!domain || typeof domain !== 'string') {
            throw new Error('Domain query parameter is required');
        }

        const result = await domainService.searchDomain(domain);
        return ApiResponse.ok(res, 'Domain search result', result);
    });

    /** POST body: `{ domains: string[] }` — multi-registrar bulk availability. */
    searchDomainsBulk = catchAsync(async (req: Request, res: Response) => {
        const domains = Array.isArray(req.body?.domains) ? req.body.domains : [];
        const result = await domainService.searchDomains(domains);
        return ApiResponse.ok(res, 'Bulk domain search results', result);
    });

    registerDomain = catchAsync(async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        const result = await domainService.registerDomain(req.body);
        auditLogSafe({
            message: `Direct domain registration initiated: ${req.body?.domain || 'unknown'}`,
            type: 'domain_registered',
            category: 'domain',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            status: 'pending',
            meta: {
                manualOverride: true,
                reason: req.body?.reason,
            },
        });
        return ApiResponse.created(res, 'Domain registration initiated', result);
    });

    registerDomainsBulk = catchAsync(async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        const result = await domainService.registerDomainsBulk({
            domains: Array.isArray(req.body?.domains) ? req.body.domains : [],
        });
        auditLogSafe({
            message: `Direct bulk domain registration: ${result.results.length} domain(s)`,
            type: 'domain_registered',
            category: 'domain',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            status: 'pending',
            meta: {
                manualOverride: true,
                count: result.results.length,
                reason: req.body?.reason,
            },
        });
        return ApiResponse.created(res, result.message, result);
    });

    renewDomain = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const { duration } = req.body;
        const requestedClientId = this.getRequestedClientIdForStaff(req);
        const clientId = requestedClientId || await getEffectiveClientId(req, res);
        if (!clientId) return;
        const owned = await domainService.getDomainServiceForClient(clientId, domain);
        if (!owned && (req as any).user?.role !== 'admin' && (req as any).user?.role !== 'staff' && (req as any).user?.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'You do not have access to this domain' });
        }
        if (!owned && requestedClientId) {
            return res.status(404).json({ success: false, message: 'Domain not found for the selected client' });
        }
        const result = await domainService.renewDomain(domain, duration);
        return ApiResponse.ok(res, 'Domain renewal initiated', result);
    });

    transferDomain = catchAsync(async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        const result = await domainService.transferDomain(req.body);
        auditLogSafe({
            message: `Direct domain transfer initiated: ${req.body?.domain || 'unknown'}`,
            type: 'domain_transferred',
            category: 'domain',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            status: 'pending',
            meta: {
                manualOverride: true,
                reason: req.body?.reason,
            },
        });
        return ApiResponse.ok(res, 'Domain transfer initiated', result);
    });

    getRegistrarConfigs = catchAsync(async (_req: Request, res: Response) => {
        const result = await registrarConfigService.getAdminRegistrarConfigs();
        return ApiResponse.ok(res, 'Registrar configs retrieved', result);
    });

    updateRegistrarConfig = catchAsync(async (req: Request, res: Response) => {
        const { registrarKey } = req.params;
        if (!registrarKey) {
            throw ApiError.badRequest('Registrar key is required');
        }

        const authReq = req as AuthRequest;
        const result = await registrarConfigService.updateRegistrarConfig(
            registrarKey,
            {
                isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined,
                settings: req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {},
            },
            authReq.user?._id?.toString?.()
        );

        auditLogSafe({
            message: `Registrar settings updated: ${result.name}`,
            type: 'settings_changed',
            category: 'settings',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'domain_registrar',
            meta: {
                registrarKey: result.key,
                isActive: result.isActive,
                implemented: result.implemented,
            },
        });

        return ApiResponse.ok(res, 'Registrar config updated', result);
    });

    syncDomainByServiceIdAdmin = catchAsync(async (req: Request, res: Response) => {
        const { serviceId } = req.params;
        if (!serviceId) {
            throw ApiError.badRequest('Service ID is required');
        }
        const authReq = req as AuthRequest;
        const result = await domainService.syncDomainByServiceId(serviceId, authReq.user?._id?.toString?.());
        return ApiResponse.ok(res, 'Domain synced successfully', result);
    });

    bulkSyncDomainsAdmin = catchAsync(async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        const result = await domainService.bulkSyncDomains(
            {
                serviceIds: Array.isArray(req.body?.serviceIds) ? req.body.serviceIds : undefined,
                search: typeof req.body?.search === 'string' ? req.body.search : undefined,
                registrar: typeof req.body?.registrar === 'string' ? req.body.registrar : undefined,
                serviceStatus: typeof req.body?.serviceStatus === 'string' ? req.body.serviceStatus : undefined,
                transferStatus: typeof req.body?.transferStatus === 'string' ? req.body.transferStatus : undefined,
                syncState: typeof req.body?.syncState === 'string' ? req.body.syncState : undefined,
                source: typeof req.body?.source === 'string' ? req.body.source : undefined,
            },
            authReq.user?._id?.toString?.()
        );
        return ApiResponse.ok(res, 'Bulk domain sync completed', result);
    });

    reconcileRegistrarDomainsAdmin = catchAsync(async (req: Request, res: Response) => {
        const { registrarKey } = req.params;
        if (!registrarKey) {
            throw ApiError.badRequest('Registrar key is required');
        }
        const result = await domainService.reconcileRegistrarDomains(registrarKey);
        return ApiResponse.ok(res, 'Registrar reconciliation completed', result);
    });

    importRegistrarDomainsAdmin = catchAsync(async (req: Request, res: Response) => {
        const { registrarKey } = req.params;
        if (!registrarKey) {
            throw ApiError.badRequest('Registrar key is required');
        }
        const domains = Array.isArray(req.body?.domains) ? req.body.domains : [];
        const authReq = req as AuthRequest;
        const result = await domainService.importRegistrarDomains(
            registrarKey,
            domains,
            authReq.user?._id?.toString?.()
        );
        return ApiResponse.ok(res, 'Registrar domains imported', result);
    });

    getEppCode = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        const eppCode = await domainService.getEppCodeForClient(clientId, domain);
        if (eppCode === null) {
            return res.status(404).json({ success: false, message: 'EPP code not available for this domain' });
        }
        return ApiResponse.ok(res, 'EPP code retrieved', { eppCode });
    });

    getDomainDetails = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        const result = await domainService.getDomainDetails(domain);
        return ApiResponse.ok(res, 'Domain details retrieved', result);
    });

    updateNameservers = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const { nameservers } = req.body;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        await domainService.updateNameservers(domain, nameservers);
        return ApiResponse.ok(res, 'Nameservers updated successfully');
    });

    getRegistrarLock = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        const result = await domainService.getRegistrarLock(domain);
        return ApiResponse.ok(res, 'Registrar lock retrieved', result);
    });

    updateRegistrarLock = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const { locked } = req.body;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        await domainService.saveRegistrarLock(domain, !!locked);
        return ApiResponse.ok(res, 'Registrar lock updated successfully');
    });

    getContactDetails = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        const result = await domainService.getContactDetails(domain);
        return ApiResponse.ok(res, 'Contact details retrieved', result);
    });

    updateContactDetails = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const { contacts } = req.body;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        await domainService.saveContactDetails(domain, contacts || {});
        return ApiResponse.ok(res, 'Contact details updated successfully');
    });

    getDns = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        const records = await domainService.getDns(domain);
        return ApiResponse.ok(res, 'DNS records retrieved', { records });
    });

    updateDns = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const { records } = req.body;
        const clientId = await this.assertDomainAccess(req, res, domain);
        if (!clientId) return;
        await domainService.saveDns(domain, records || []);
        return ApiResponse.ok(res, 'DNS records updated successfully');
    });

    /** Admin: global domain defaults (default registrar + fallback nameservers). */
    getDomainSystemDefaultsAdmin = catchAsync(async (_req: Request, res: Response) => {
        const settings = await getDomainSystemSettingsForAdmin();
        return ApiResponse.ok(res, 'Domain system settings retrieved', settings);
    });

    updateDomainSystemDefaultsAdmin = catchAsync(async (req: Request, res: Response) => {
        const user = (req as AuthRequest).user!;
        const body = req.body || {};
        const payload: Partial<DomainSystemSettingsDto> = {};
        if (body.defaultRegistrarKey !== undefined) {
            payload.defaultRegistrarKey = String(body.defaultRegistrarKey);
        }
        for (const k of ['nameserver1', 'nameserver2', 'nameserver3', 'nameserver4'] as const) {
            if (body[k] !== undefined) {
                payload[k] = String(body[k]);
            }
        }
        if (payload.defaultRegistrarKey !== undefined) {
            const nk = normalizeRegistrarKey(payload.defaultRegistrarKey);
            if (!getRegistrarProvider(nk)) {
                throw ApiError.badRequest(
                    `Registrar "${payload.defaultRegistrarKey}" is not implemented. Add the provider first.`
                );
            }
            payload.defaultRegistrarKey = nk;
        }
        const settings = await updateDomainSystemSettings(payload, user._id?.toString());
        auditLogSafe({
            message: 'Domain system settings updated',
            type: 'settings_changed',
            category: 'settings',
            actorType: 'user',
            actorId: user._id?.toString(),
            source: 'manual',
            meta: { keys: Object.keys(payload) } as Record<string, unknown>,
        });
        return ApiResponse.ok(res, 'Domain system settings updated', settings);
    });
}

export default new DomainController();

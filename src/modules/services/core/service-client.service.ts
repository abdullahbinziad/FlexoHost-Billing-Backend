import { serviceRepository, hostingDetailsRepository } from '../repositories';
import { IService } from '../service.interface';
import { ServiceType } from '../types/enums';
import { serverService } from '../../server/server.service';
import Server from '../../server/server.model';
import OrderItem from '../../order/order-item.model';
import Product from '../../product/product.model';
import HostingServiceDetails from '../models/hosting-details.model';
import DomainServiceDetails from '../models/domain-details.model';
import { resolveDomainFqdnFromDetailsAndOrderItem } from '../../domain/utils/domain-display';
import type { WhmApiClient } from '../../whm/whm-api-client';
import logger from '../../../utils/logger';

/** Frontend shortcut key -> official Jupiter appkey + service + label. No Subdomains/Addon Domains (not in get_users_links). */
const SHORTCUT_MAP: Record<
    string,
    { service: 'cpaneld' | 'webmaild'; app: string | null; label: string }
> = {
    'cpanel-home': { service: 'cpaneld', app: null, label: 'Open cPanel' },
    webmail: { service: 'webmaild', app: null, label: 'Webmail' },
    'file-manager': { service: 'cpaneld', app: 'FileManager_Home', label: 'File Manager' },
    'email-accounts': { service: 'cpaneld', app: 'Email_Accounts', label: 'Email Accounts' },
    backup: { service: 'cpaneld', app: 'Backups_Home', label: 'Backup' },
    'change-password': { service: 'cpaneld', app: 'Password_Change', label: 'Change Password' },
    forwarders: { service: 'cpaneld', app: 'Email_Forwarders', label: 'Forwarders' },
    autoresponders: { service: 'cpaneld', app: 'Email_AutoResponders', label: 'Autoresponders' },
    'cron-jobs': { service: 'cpaneld', app: 'Cron_Home', label: 'Cron Jobs' },
    'mysql-databases': { service: 'cpaneld', app: 'Database_MySQL', label: 'MySQL Databases' },
    phpmyadmin: { service: 'cpaneld', app: 'Database_phpMyAdmin', label: 'phpMyAdmin' },
    awstats: { service: 'cpaneld', app: 'Stats_AWStats', label: 'Awstats' },
};

/** Order for shortcut list: most used / most requested first. */
const SHORTCUT_ORDER = [
    'cpanel-home',
    'webmail',
    'file-manager',
    'email-accounts',
    'backup',
    'change-password',
    'forwarders',
    'autoresponders',
    'cron-jobs',
    'mysql-databases',
    'phpmyadmin',
    'awstats',
];

export function resolveShortcutTarget(shortcutKey: string): { service: 'cpaneld' | 'webmaild'; app: string | null; label: string } | null {
    const key = (shortcutKey || '').trim().toLowerCase();
    return SHORTCUT_MAP[key] ?? null;
}

export class ServiceClientService {
    async listServices(
        clientId: string,
        opts: { type?: ServiceType; status?: any; page?: number; limit?: number; serviceIds?: string[]; types?: string[] } = {}
    ) {
        const { type, status, page = 1, limit = 50, serviceIds, types } = opts;
        const result = await serviceRepository.listByClientId(clientId, { type, status, page, limit, serviceIds, types });
        const enriched = await this.enrichServicesForList(result.services);
        return { services: enriched, total: result.total, pages: result.pages };
    }

    /** Attach displayName (from order item), identifier + serverLocation (from hosting details) for list views. */
    private async enrichServicesForList(services: IService[]): Promise<any[]> {
        if (!services.length) return [];
        const orderItemIds = services.map((s) => s.orderItemId);
        const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } })
            .select('_id nameSnapshot configSnapshot')
            .lean();
        const orderItemMap = Object.fromEntries(orderItems.map((o: any) => [o._id.toString(), o]));

        const domainServiceIds = services.filter((s) => s.type === ServiceType.DOMAIN).map((s) => s._id);
        let domainMap: Record<string, { domainName?: string }> = {};
        if (domainServiceIds.length > 0) {
            const domainRows = await DomainServiceDetails.find({ serviceId: { $in: domainServiceIds } })
                .select('serviceId domainName')
                .lean();
            domainMap = Object.fromEntries(
                domainRows.map((d: any) => [d.serviceId.toString(), { domainName: d.domainName }])
            );
        }

        const hostingServiceIds = services.filter((s) => s.type === ServiceType.HOSTING).map((s) => s._id);
        let hostingMap: Record<string, any> = {};
        if (hostingServiceIds.length > 0) {
            const details = await HostingServiceDetails.find({ serviceId: { $in: hostingServiceIds } })
                .select('serviceId primaryDomain serverLocation serverId')
                .lean();
            hostingMap = Object.fromEntries(
                details.map((d: any) => [d.serviceId.toString(), { primaryDomain: d.primaryDomain, serverLocation: d.serverLocation, serverId: d.serverId }])
            );
            // Backfill serverLocation from Server when missing (e.g. legacy hosting)
            for (const sid of hostingServiceIds) {
                const idStr = (sid as any)?.toString?.() || sid;
                const h = hostingMap[idStr];
                if (h && !h.serverLocation && h.serverId) {
                    const server = await Server.findById(h.serverId).select('location').lean();
                    if (server?.location) {
                        h.serverLocation = server.location;
                        await hostingDetailsRepository.updateByServiceId(idStr, { serverLocation: server.location } as any);
                    }
                }
            }
        }

        return services.map((s) => {
            const svc = s.toObject ? s.toObject() : { ...s };
            const oi = orderItemMap[(s.orderItemId as any)?.toString?.() || s.orderItemId];
            svc.displayName = oi?.nameSnapshot || 'Hosting';
            if (s.type === ServiceType.HOSTING) {
                const h = hostingMap[(s._id as any)?.toString?.() || s._id];
                const meta = (svc.meta || {}) as Record<string, unknown>;
                const fromOrderLoc = oi?.configSnapshot?.serverLocation;
                const orderedMetaLoc = meta.orderedServerLocation;
                svc.identifier = h?.primaryDomain || oi?.configSnapshot?.primaryDomain || oi?.configSnapshot?.domain || '—';
                svc.serverLocation =
                    h?.serverLocation ||
                    (fromOrderLoc ? String(fromOrderLoc).trim() : undefined) ||
                    (orderedMetaLoc ? String(orderedMetaLoc).trim() : undefined) ||
                    undefined;
            }
            if (s.type === ServiceType.DOMAIN) {
                const d = domainMap[(s._id as any)?.toString?.() || s._id];
                const fqdn = resolveDomainFqdnFromDetailsAndOrderItem(d, oi);
                if (fqdn) {
                    svc.identifier = fqdn;
                    svc.displayName = fqdn;
                }
            }
            return svc;
        });
    }

    async getServiceWithDetails(clientId: string, serviceId: string) {
        const result = await serviceRepository.findByIdWithDetails(serviceId);
        if (!result) return null;

        // Verify the authenticated user can access this clientId & service
        if (result.service.clientId.toString() !== clientId) {
            return null; // Don't leak exists status
        }

        // Enrich with product/package + order config (location, group) from order item — source of truth for checkout choices
        const orderItem = await OrderItem.findById(result.service.orderItemId)
            .select('nameSnapshot configSnapshot productId type')
            .lean();
        const serviceObj = result.service.toObject ? result.service.toObject() : { ...result.service };
        const oi = orderItem as any;
        const cfg = oi?.configSnapshot || {};
        serviceObj.displayName =
            oi?.nameSnapshot || (result.service.type === ServiceType.DOMAIN ? 'Domain' : 'Hosting');
        if (result.details && (result.details as any).packageId) {
            (serviceObj as any).packageId = (result.details as any).packageId;
        }

        const meta = { ...((serviceObj as any).meta || {}) } as Record<string, unknown>;
        if (oi?.productId && !meta.adminPackageProductId) {
            meta.adminPackageProductId = oi.productId.toString();
        }
        if (oi?.nameSnapshot && !meta.adminPackageName) {
            meta.adminPackageName = String(oi.nameSnapshot).trim();
        }
        if (String(oi?.type || '').toUpperCase() === 'HOSTING') {
            if (cfg.serverLocation && !meta.orderedServerLocation) {
                meta.orderedServerLocation = String(cfg.serverLocation).trim();
            }
            if (cfg.serverGroup && !meta.orderedServerGroup) {
                meta.orderedServerGroup = String(cfg.serverGroup).trim();
            }
            if (cfg.whmPackageName && !meta.orderedWhmPackage) {
                meta.orderedWhmPackage = String(cfg.whmPackageName).trim();
            }
        }
        if (
            String(oi?.type || '').toUpperCase() === 'HOSTING' &&
            oi?.productId &&
            !meta.orderedWhmPackage
        ) {
            const prod = await Product.findById(oi.productId).select('module.packageName').lean();
            const pn = (prod as any)?.module?.packageName;
            if (pn) meta.orderedWhmPackage = String(pn).trim();
        }
        (serviceObj as any).meta = meta;
        const orderedLoc = meta.orderedServerLocation ? String(meta.orderedServerLocation) : '';
        if (orderedLoc && !(serviceObj as any).serverLocation) {
            (serviceObj as any).serverLocation = orderedLoc;
        }

        // Resolve details for response; backfill serverLocation from Server when missing (e.g. legacy hosting)
        let detailsForResponse: any = result.details
            ? (result.details.toObject ? result.details.toObject() : { ...result.details })
            : null;
        if (
            result.service.type === ServiceType.HOSTING &&
            detailsForResponse &&
            !detailsForResponse.serverLocation &&
            detailsForResponse.serverId
        ) {
            const server = await Server.findById(detailsForResponse.serverId).select('location').lean();
            if (server?.location) {
                detailsForResponse.serverLocation = server.location;
                await hostingDetailsRepository.updateByServiceId(serviceId, { serverLocation: server.location } as any);
            }
        }

        // Pending hosting: no HostingServiceDetails row yet — expose checkout choices for admin/client UI
        if (result.service.type === ServiceType.HOSTING && !detailsForResponse && oi) {
            const c = oi.configSnapshot || {};
            if (c.primaryDomain || c.domain || c.serverLocation || orderedLoc) {
                detailsForResponse = {
                    primaryDomain: (c.primaryDomain || c.domain || '').trim() || undefined,
                    serverLocation: (c.serverLocation ? String(c.serverLocation).trim() : '') || orderedLoc || undefined,
                    resourceLimits: { diskMb: 0, bandwidthMb: 0, inodeLimit: 0 },
                };
            }
        }

        if (result.service.type === ServiceType.DOMAIN && oi) {
            const resolvedFqdn = resolveDomainFqdnFromDetailsAndOrderItem(detailsForResponse, oi);
            if (resolvedFqdn) {
                (serviceObj as any).identifier = resolvedFqdn;
                (serviceObj as any).displayName = resolvedFqdn;
                if (detailsForResponse) {
                    detailsForResponse = { ...detailsForResponse, domainName: resolvedFqdn };
                } else {
                    detailsForResponse = {
                        domainName: resolvedFqdn,
                        resourceLimits: { diskMb: 0, bandwidthMb: 0, inodeLimit: 0 },
                    };
                }
            }
        }

        // Mask secrets safely before returning
        return this.maskServiceSecrets(serviceObj, detailsForResponse);
    }

    private maskServiceSecrets(service: IService, details: any) {
        if (!details) return { service, details: null };

        const safeDetails = details.toObject ? details.toObject() : { ...details };

        // Security: Never return secrets (raw eppCode, passwords, raw license key)
        if (service.type === ServiceType.DOMAIN) {
            const hasEppCode = !!safeDetails.eppCodeEncrypted;
            delete safeDetails.eppCodeEncrypted;
            safeDetails.hasEppCode = hasEppCode;
        }

        if (service.type === ServiceType.HOSTING || service.type === ServiceType.VPS) {
            const hasCredentials = !!safeDetails.credentialSecretId;
            delete safeDetails.credentialSecretId;
            safeDetails.hasCredentials = hasCredentials;
        }

        if (service.type === ServiceType.LICENSE) {
            delete safeDetails.licenseKeyEncrypted;
            delete safeDetails.licenseKeyHash;
        }

        return { service, details: safeDetails };
    }

    /**
     * Shared hosting context: resolve service, ownership, WHM client, and primary domain.
     * Returns { accountUsername, whmClient, primaryDomain } or { error }. Used by login URL, usage, and email create.
     */
    private async getHostingContext(
        clientId: string,
        serviceId: string
    ): Promise<{ accountUsername: string; whmClient: WhmApiClient; primaryDomain: string } | { error: string }> {
        const result = await serviceRepository.findByIdWithDetails(serviceId);
        if (!result || result.service.type !== ServiceType.HOSTING) {
            return { error: 'Service not found or not a hosting service' };
        }
        if (result.service.clientId.toString() !== clientId) {
            return { error: 'Unauthorized' };
        }
        const details = result.details as any;
        if (!details?.accountUsername || !details?.serverId) {
            return { error: 'Hosting account or server not linked' };
        }
        const serverId = details.serverId?.toString?.() || details.serverId;
        const whmClient = await serverService.getWhmClient(serverId);
        if (!whmClient) {
            return { error: 'Server configuration unavailable' };
        }
        const primaryDomain = (details.primaryDomain || '').trim() || '';
        return { accountUsername: details.accountUsername, whmClient, primaryDomain };
    }

    /**
     * Create an email mailbox for this hosting service (cPanel Email::addpop).
     */
    async createHostingEmailAccount(
        clientId: string,
        serviceId: string,
        emailLocalPart: string,
        password: string
    ): Promise<{ success: true; email: string } | { error: string }> {
        const local = (emailLocalPart || '').trim().toLowerCase();
        if (!local) {
            return { error: 'Email username is required' };
        }
        if (!/^[a-z0-9._+-]+$/.test(local)) {
            return { error: 'Email username can only contain letters, numbers, and . _ + -' };
        }
        if (local.length > 64) {
            return { error: 'Email username is too long' };
        }
        if (!password || password.length < 5) {
            return { error: 'Password must be at least 5 characters' };
        }
        const ctx = await this.getHostingContext(clientId, serviceId);
        if ('error' in ctx) return { error: ctx.error };
        if (!ctx.primaryDomain) {
            return { error: 'Hosting domain not configured' };
        }
        try {
            await ctx.whmClient.createEmailMailbox(
                ctx.accountUsername,
                ctx.primaryDomain,
                local,
                password,
                250
            );
            const email = `${local}@${ctx.primaryDomain}`;
            logger.info(`[cPanel email] created ${email} for serviceId=${serviceId}`);
            return { success: true, email };
        } catch (err: any) {
            const msg = err?.message || 'Failed to create email account';
            logger.warn(`[cPanel email] create failed for serviceId=${serviceId} user=${local}: ${msg}`);
            return { error: msg };
        }
    }

    /**
     * List available cPanel shortcuts for this hosting service.
     * Uses WHM get_users_links as source of truth: cpanel-home and webmail always; others only if appkey exists.
     */
    async getHostingShortcuts(
        clientId: string,
        serviceId: string
    ): Promise<{ shortcuts: Array<{ key: string; label: string }> } | { error: string }> {
        const ctx = await this.getHostingContext(clientId, serviceId);
        if ('error' in ctx) return { error: ctx.error };
        logger.info(`[cPanel shortcuts] serviceId=${serviceId} cpanelUser=${ctx.accountUsername}`);
        try {
            const links = await ctx.whmClient.getUsersLinks(ctx.accountUsername, 'cpaneld');
            const appkeys = Object.keys(links || {});
            logger.info(`[cPanel shortcuts] get_users_links returned appkeys count=${appkeys.length} keys=${appkeys.slice(0, 20).join(', ')}${appkeys.length > 20 ? '...' : ''}`);
            const shortcuts: Array<{ key: string; label: string }> = [];
            for (const key of SHORTCUT_ORDER) {
                const def = SHORTCUT_MAP[key];
                if (!def) continue;
                if (def.app == null) {
                    shortcuts.push({ key, label: def.label });
                } else if (appkeys.includes(def.app)) {
                    shortcuts.push({ key, label: def.label });
                }
            }
            return { shortcuts };
        } catch (err: any) {
            logger.warn(`[cPanel shortcuts] get_users_links failed for serviceId=${serviceId}: ${err?.message || err}`);
            return { error: err?.message || 'Failed to load shortcuts' };
        }
    }

    /**
     * One-click login URL for a shortcut. Verifies appkey in get_users_links before create_user_session for app-based shortcuts.
     */
    async getHostingLoginUrl(
        clientId: string,
        serviceId: string,
        shortcutKey: string
    ): Promise<{ url: string } | { error: string }> {
        const key = (shortcutKey || '').trim().toLowerCase();
        logger.info(`[cPanel shortcut open] serviceId=${serviceId} shortcutKey=${key}`);
        const target = resolveShortcutTarget(key);
        if (!target) {
            logger.warn(`[cPanel shortcut open] unsupported shortcutKey=${key}`);
            return { error: 'Unknown shortcut' };
        }
        const ctx = await this.getHostingContext(clientId, serviceId);
        if ('error' in ctx) return { error: ctx.error };
        logger.info(`[cPanel shortcut open] cpanelUser=${ctx.accountUsername} resolvedApp=${target.app ?? 'none'} label=${target.label}`);
        if (target.app != null) {
            try {
                const links = await ctx.whmClient.getUsersLinks(ctx.accountUsername, 'cpaneld');
                const appkeys = Object.keys(links || {});
                if (!appkeys.includes(target.app)) {
                    logger.warn(`[cPanel shortcut open] appkey ${target.app} not in get_users_links for user`);
                    return { error: 'Shortcut not available for this account' };
                }
            } catch (err: any) {
                logger.warn(`[cPanel shortcut open] get_users_links failed: ${err?.message || err}`);
                return { error: err?.message || 'Failed to verify shortcut' };
            }
        }
        try {
            const url = await ctx.whmClient.createUserSession(
                ctx.accountUsername,
                target.service,
                target.app
            );
            logger.info(`[cPanel shortcut open] create_user_session success for shortcutKey=${key}`);
            return { url };
        } catch (err: any) {
            logger.warn(`[cPanel shortcut open] create_user_session failed: ${err?.message || err}`);
            return { error: err?.message || 'Failed to create login session' };
        }
    }

    /**
     * Get disk and bandwidth usage from DB (usageSnapshot). No WHM call. Returns zeros and updatedAt null if no snapshot.
     */
    async getHostingUsage(
        clientId: string,
        serviceId: string
    ): Promise<{ disk: { usedMb: number; limitMb: number }; bandwidth: { usedMb: number; limitMb: number }; updatedAt?: string | null } | { error: string }> {
        const ctx = await this.getHostingContext(clientId, serviceId);
        if ('error' in ctx) return { error: ctx.error };
        const details = await hostingDetailsRepository.findByServiceId(serviceId);
        const snap = details?.usageSnapshot as any;
        if (snap && typeof snap.diskUsedMb === 'number') {
            return {
                disk: { usedMb: snap.diskUsedMb, limitMb: snap.diskLimitMb ?? 0 },
                bandwidth: { usedMb: snap.bandwidthUsedMb ?? 0, limitMb: snap.bandwidthLimitMb ?? 0 },
                updatedAt: snap.updatedAt ? new Date(snap.updatedAt).toISOString() : null,
            };
        }
        return {
            disk: { usedMb: 0, limitMb: 0 },
            bandwidth: { usedMb: 0, limitMb: 0 },
            updatedAt: null,
        };
    }

    /**
     * Refresh usage from WHM, save to DB, return updated usage. Used by Reload button and usage-sync scheduler.
     */
    async refreshHostingUsage(
        clientId: string,
        serviceId: string
    ): Promise<{ disk: { usedMb: number; limitMb: number }; bandwidth: { usedMb: number; limitMb: number }; updatedAt: string } | { error: string }> {
        const ctx = await this.getHostingContext(clientId, serviceId);
        if ('error' in ctx) return { error: ctx.error };
        try {
            const raw = await ctx.whmClient.getAccountUsage(ctx.accountUsername);
            const updatedAt = new Date();
            const usageSnapshot = {
                diskUsedMb: raw.disk?.usedMb ?? 0,
                diskLimitMb: raw.disk?.limitMb ?? 0,
                bandwidthUsedMb: raw.bandwidth?.usedMb ?? 0,
                bandwidthLimitMb: raw.bandwidth?.limitMb ?? 0,
                updatedAt,
            };
            await hostingDetailsRepository.updateByServiceId(serviceId, { usageSnapshot } as any);
            return {
                disk: { usedMb: usageSnapshot.diskUsedMb, limitMb: usageSnapshot.diskLimitMb },
                bandwidth: { usedMb: usageSnapshot.bandwidthUsedMb, limitMb: usageSnapshot.bandwidthLimitMb },
                updatedAt: updatedAt.toISOString(),
            };
        } catch (err: any) {
            return { error: err?.message || 'Failed to fetch usage' };
        }
    }
}

export default new ServiceClientService();

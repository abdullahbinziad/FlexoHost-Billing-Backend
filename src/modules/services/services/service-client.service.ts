import { serviceRepository } from '../repositories';
import { IService } from '../service.interface';
import { ServiceType } from '../types/enums';
import { serverService } from '../../server/server.service';
import OrderItem from '../../order/order-item.model';
import HostingServiceDetails from '../models/hosting-details.model';

export class ServiceClientService {
    async listServices(clientId: string, type?: ServiceType, status?: any, page = 1, limit = 50) {
        const result = await serviceRepository.listByClientId(clientId, { type, status, page, limit });
        const enriched = await this.enrichServicesForList(result.services);
        return { services: enriched, total: result.total, pages: result.pages };
    }

    /** Attach displayName (from order item), identifier + serverLocation (from hosting details) for list views. */
    private async enrichServicesForList(services: IService[]): Promise<any[]> {
        if (!services.length) return [];
        const orderItemIds = services.map((s) => s.orderItemId);
        const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } })
            .select('_id nameSnapshot')
            .lean();
        const orderItemMap = Object.fromEntries(orderItems.map((o: any) => [o._id.toString(), o]));

        const hostingServiceIds = services.filter((s) => s.type === ServiceType.HOSTING).map((s) => s._id);
        let hostingMap: Record<string, any> = {};
        if (hostingServiceIds.length > 0) {
            const details = await HostingServiceDetails.find({ serviceId: { $in: hostingServiceIds } })
                .select('serviceId primaryDomain serverLocation')
                .lean();
            hostingMap = Object.fromEntries(
                details.map((d: any) => [d.serviceId.toString(), { primaryDomain: d.primaryDomain, serverLocation: d.serverLocation }])
            );
        }

        return services.map((s) => {
            const svc = s.toObject ? s.toObject() : { ...s };
            const oi = orderItemMap[(s.orderItemId as any)?.toString?.() || s.orderItemId];
            svc.displayName = oi?.nameSnapshot || 'Hosting';
            if (s.type === ServiceType.HOSTING) {
                const h = hostingMap[(s._id as any)?.toString?.() || s._id];
                svc.identifier = h?.primaryDomain || '—';
                svc.serverLocation = h?.serverLocation || undefined;
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

        // Mask secrets safely before returning
        return this.maskServiceSecrets(result.service, result.details);
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
     * Generate one-click login URL for cPanel or Webmail (SSO).
     * Caller must have verified that user owns the service or is admin.
     */
    async getHostingLoginUrl(
        clientId: string,
        serviceId: string,
        target: 'cpanel' | 'webmail'
    ): Promise<{ url: string } | { error: string }> {
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
        const client = await serverService.getWhmClient(serverId);
        if (!client) {
            return { error: 'Server configuration unavailable' };
        }
        try {
            const service = target === 'webmail' ? 'webmail' : 'cpaneld';
            const url = await client.createUserSession(details.accountUsername, service as 'cpaneld' | 'webmail');
            return { url };
        } catch (err: any) {
            return { error: err?.message || 'Failed to create login session' };
        }
    }
}

export default new ServiceClientService();

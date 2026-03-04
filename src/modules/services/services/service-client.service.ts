import { serviceRepository } from '../repositories';
import { IService } from '../service.interface';
import { ServiceType } from '../types/enums';

export class ServiceClientService {
    async listServices(clientId: string, type?: ServiceType, status?: any, page = 1, limit = 10) {
        // Query services by clientId + type + filters + pagination
        return await serviceRepository.listByClientId(clientId, { type, status, page, limit });
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
}

export default new ServiceClientService();

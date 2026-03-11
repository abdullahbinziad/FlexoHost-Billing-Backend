import { ServiceType } from '../types/enums';
import type { IProvisioningProvider } from './types';

/**
 * Central registry for provisioning providers by service type.
 * Worker looks up provider by job.serviceType; no switch on type in worker code.
 */
class ProvisioningProviderRegistry {
    private readonly providers = new Map<ServiceType, IProvisioningProvider>();

    register(provider: IProvisioningProvider): void {
        this.providers.set(provider.type, provider);
    }

    get(serviceType: ServiceType): IProvisioningProvider | undefined {
        return this.providers.get(serviceType);
    }

    has(serviceType: ServiceType): boolean {
        return this.providers.has(serviceType);
    }

    getAllTypes(): ServiceType[] {
        return Array.from(this.providers.keys());
    }
}

export const provisioningProviderRegistry = new ProvisioningProviderRegistry();

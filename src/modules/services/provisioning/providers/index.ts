import { provisioningProviderRegistry } from '../provider-registry';
import { DomainProvisioningProvider } from './domain.provider';
import { HostingProvisioningProvider } from './hosting.provider';
import { VpsProvisioningProvider } from './vps.provider';
import { EmailProvisioningProvider } from './email.provider';
import { LicenseProvisioningProvider } from './license.provider';

/**
 * Register all built-in provisioning providers.
 * Call once at app bootstrap (e.g. from services module index or app.ts).
 */
export function registerProvisioningProviders(): void {
    provisioningProviderRegistry.register(new DomainProvisioningProvider());
    provisioningProviderRegistry.register(new HostingProvisioningProvider());
    provisioningProviderRegistry.register(new VpsProvisioningProvider());
    provisioningProviderRegistry.register(new EmailProvisioningProvider());
    provisioningProviderRegistry.register(new LicenseProvisioningProvider());
}

export { DomainProvisioningProvider } from './domain.provider';
export { HostingProvisioningProvider } from './hosting.provider';
export { VpsProvisioningProvider } from './vps.provider';
export { EmailProvisioningProvider } from './email.provider';
export { LicenseProvisioningProvider } from './license.provider';

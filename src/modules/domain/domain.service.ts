import { IDomainRegistrar, IDomainSearchResult, IDomainRegistrationPayload, IDomainTransferPayload, IDomainDetails } from './domain.interface';
import { DynadotRegistrar } from './registrars/dynadot';
import { NamelyRegistrar } from './registrars/namely';
import { ConnectResellerRegistrar } from './registrars/connectReseller';
import { DOMAIN_CONFIG } from './domain.config';
import ApiError from '../../utils/apiError';
import tldService from './tld/tld.service';

class DomainService {
    private registrars: Map<string, IDomainRegistrar> = new Map();

    constructor() {
        // Initialize registrars
        const dynadot = new DynadotRegistrar();
        const namely = new NamelyRegistrar();
        const connectReseller = new ConnectResellerRegistrar();

        this.registrars.set(dynadot.name, dynadot);
        this.registrars.set(namely.name, namely);
        this.registrars.set(connectReseller.name, connectReseller);
    }

    /**
     * Extracts TLD from a domain name.
     * @param domain e.g., "example.com" -> "com", "site.co.uk" -> "co.uk" (or just "uk" depending on simplicity)
     * For now, we use a simple split by the last dot, or handle compound TLDs if needed.
     */
    private getTLD(domain: string): string {
        const parts = domain.split('.');
        if (parts.length < 2) return '';
        // Basic implementation: take the last part. 
        // Improvement: Use a library or list for compound TLDs like .co.uk if strict mapping is needed.
        // For configuration simple map, usually 'uk' or 'com' is enough, or exact TLD string.
        return parts[parts.length - 1].toLowerCase();
    }

    /**
     * Resolves the appropriate registrar for a given domain/TLD.
     */
    private async resolveRegistrar(domain: string): Promise<IDomainRegistrar> {
        const tld = this.getTLD(domain);

        let registrarName: string | null = null;

        // 1. Try to get from Database configuration (Dynamic)
        try {
            // Lazy import or utilize imported service. 
            // Note: Use direct import if cyclic dependency isn't an issue. 
            // Since TLDService is in a sub-module, it should be fine.
            const dbRegistrar = await tldService.getRegistrarForTLD(tld);
            if (dbRegistrar) {
                registrarName = dbRegistrar;
            }
        } catch (error) {
            console.error(`Error fetching registrar for TLD ${tld} from DB:`, error);
            // Proceed to config fallback
        }

        // 2. Fallback to Static Config
        if (!registrarName) {
            registrarName = DOMAIN_CONFIG.tldRegistrarMap[tld];
        }

        // 3. Fallback to Default
        if (!registrarName) {
            registrarName = DOMAIN_CONFIG.defaultRegistrar;
        }

        const registrar = this.registrars.get(registrarName);

        if (!registrar) {
            // If the configured registrar is not loaded/initialized
            throw new ApiError(500, `Registrar ${registrarName} is configured but not initialized.`);
        }

        return registrar;
    }

    /**
     * Helper to get a specific registrar by name if strictly needed (e.g. admin override)
     */
    public getRegistrarByName(name: string): IDomainRegistrar {
        const registrar = this.registrars.get(name);
        if (!registrar) {
            throw new ApiError(400, `Registrar ${name} not found`);
        }
        return registrar;
    }

    async searchDomain(domain: string): Promise<IDomainSearchResult> {
        const registrar = await this.resolveRegistrar(domain);
        return registrar.searchDomain(domain);
    }

    async registerDomain(payload: IDomainRegistrationPayload): Promise<any> {
        const registrar = await this.resolveRegistrar(payload.domain);
        return registrar.registerDomain(payload);
    }

    async renewDomain(domain: string, duration: number): Promise<any> {
        // Ideally, check database for which registrar holds this domain.
        // For now, assuming static config routing or failover.
        const registrar = await this.resolveRegistrar(domain);
        return registrar.renewDomain(domain, duration);
    }

    async transferDomain(payload: IDomainTransferPayload): Promise<any> {
        const registrar = await this.resolveRegistrar(payload.domain);
        return registrar.transferDomain(payload);
    }

    async getDomainDetails(domain: string): Promise<IDomainDetails> {
        const registrar = await this.resolveRegistrar(domain);
        return registrar.getDomainDetails(domain);
    }

    async updateNameservers(domain: string, nameservers: string[]): Promise<void> {
        const registrar = await this.resolveRegistrar(domain);
        return registrar.updateNameservers(domain, nameservers);
    }
}

export default new DomainService();

import type {
    AccountBalanceResult,
    DomainAvailabilityResult,
    DomainContactDetails,
    DomainInformation,
    DnsRecord,
    GetEppCodeParams,
    GetEppCodeResult,
    IRegistrarProvider,
    OrderStatusResult,
    RegisterDomainParams,
    RegisterDomainResult,
    RenewDomainParams,
    RenewDomainResult,
    TldPriceItem,
    TransferDomainParams,
    TransferDomainResult,
    TransferStatusResult,
} from './registrar.types';
import { getRegistrarProvider, normalizeRegistrarKey, resolveRegistrarKeyForDomain, resolveRegistrarProviderForDomain } from './registrar-registry';

class DomainRegistrarService {
    async checkAvailability(domains: string[]): Promise<DomainAvailabilityResult[]> {
        const groups = new Map<IRegistrarProvider, string[]>();
        for (const domain of domains) {
            const provider = resolveRegistrarProviderForDomain(domain);
            const existing = groups.get(provider) ?? [];
            existing.push(domain);
            groups.set(provider, existing);
        }

        const results = await Promise.all(
            Array.from(groups.entries()).map(async ([provider, groupedDomains]) => provider.checkAvailability(groupedDomains))
        );

        return results.flat();
    }

    async registerDomain(params: RegisterDomainParams, registrarName?: string | null): Promise<RegisterDomainResult & { registrar: string; remoteId: string }> {
        const provider = resolveRegistrarProviderForDomain(params.domain, registrarName);
        const result = await provider.registerDomain(params);
        return { ...result, registrar: provider.name, remoteId: result.orderId ?? result.domain };
    }

    async transferDomain(params: TransferDomainParams, registrarName?: string | null): Promise<TransferDomainResult & { registrar: string; remoteId: string }> {
        const provider = resolveRegistrarProviderForDomain(params.domain, registrarName);
        const result = await provider.transferDomain(params);
        return { ...result, registrar: provider.name, remoteId: result.orderId ?? result.domain };
    }

    async renewDomain(params: RenewDomainParams, registrarName?: string | null): Promise<RenewDomainResult & { registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(params.domain, registrarName);
        const result = await provider.renewDomain(params);
        return { ...result, registrar: provider.name };
    }

    async getDomainInformation(domain: string, registrarName?: string | null): Promise<DomainInformation & { registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        const result = await provider.getDomainInformation(domain);
        return { ...result, registrar: provider.name };
    }

    async saveNameservers(domain: string, nameservers: string[], registrarName?: string | null): Promise<{ registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        await provider.saveNameservers(domain, nameservers);
        return { registrar: provider.name };
    }

    async getRegistrarLock(domain: string, registrarName?: string | null): Promise<{ locked: boolean; registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        const locked = await provider.getRegistrarLock(domain);
        return { locked, registrar: provider.name };
    }

    async saveRegistrarLock(domain: string, locked: boolean, registrarName?: string | null): Promise<{ registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        await provider.saveRegistrarLock(domain, locked);
        return { registrar: provider.name };
    }

    async getContactDetails(domain: string, registrarName?: string | null): Promise<DomainContactDetails & { registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        const result = await provider.getContactDetails(domain);
        return { ...result, registrar: provider.name };
    }

    async saveContactDetails(domain: string, contacts: Partial<DomainContactDetails>, registrarName?: string | null): Promise<{ registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        await provider.saveContactDetails(domain, contacts);
        return { registrar: provider.name };
    }

    async getDns(domain: string, registrarName?: string | null): Promise<{ records: DnsRecord[]; registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        const records = await provider.getDns(domain);
        return { records, registrar: provider.name };
    }

    async saveDns(domain: string, records: DnsRecord[], registrarName?: string | null): Promise<{ registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        await provider.saveDns(domain, records);
        return { registrar: provider.name };
    }

    async getEppCode(domain: string, options?: GetEppCodeParams, registrarName?: string | null): Promise<GetEppCodeResult & { registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        const result = await provider.getEppCode(domain, options);
        return { ...result, registrar: provider.name };
    }

    async getTransferStatus(domain: string, registrarName?: string | null): Promise<TransferStatusResult & { registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        const result = await provider.syncTransfer(domain);
        return { ...result, registrar: provider.name };
    }

    async syncDomain(domain: string, registrarName?: string | null): Promise<DomainInformation & { registrar: string }> {
        const provider = resolveRegistrarProviderForDomain(domain, registrarName);
        const result = await provider.syncDomain(domain);
        return { ...result, registrar: provider.name };
    }

    async listRegistrarDomains(registrarKey: string): Promise<{ registrar: string; domains: { domain: string; [k: string]: unknown }[] }> {
        const normalizedKey = normalizeRegistrarKey(registrarKey);
        const provider = getRegistrarProvider(normalizedKey);
        if (!provider) {
            throw new Error(`No registrar provider registered for key: ${registrarKey}`);
        }
        if (!provider.listDomains) {
            throw new Error(`Registrar ${provider.name} does not support domain listing`);
        }
        const domains = await provider.listDomains();
        return { registrar: provider.name, domains };
    }

    async getTldPricing(registrarKey: string, tlds?: string[]): Promise<TldPriceItem[]> {
        const normalizedKey = normalizeRegistrarKey(registrarKey);
        const provider = getRegistrarProvider(normalizedKey);
        if (!provider) {
            throw new Error(`No registrar provider registered for key: ${registrarKey}`);
        }
        return provider.getTldPricing(tlds);
    }

    async getRegistrarAccountBalance(registrarKey: string): Promise<AccountBalanceResult & { registrar: string }> {
        const normalizedKey = normalizeRegistrarKey(registrarKey);
        const provider = getRegistrarProvider(normalizedKey);
        if (!provider?.getAccountBalance) {
            throw new Error(`Registrar ${registrarKey} does not support account balance lookup`);
        }
        const result = await provider.getAccountBalance();
        return { ...result, registrar: provider.name };
    }

    async getRegistrarOrderStatus(registrarKey: string, orderId: string): Promise<OrderStatusResult & { registrar: string }> {
        const normalizedKey = normalizeRegistrarKey(registrarKey);
        const provider = getRegistrarProvider(normalizedKey);
        if (!provider?.getOrderStatus) {
            throw new Error(`Registrar ${registrarKey} does not support order status lookup`);
        }
        const result = await provider.getOrderStatus(orderId);
        return { ...result, registrar: provider.name };
    }

    resolveRegistrarName(domain: string, preferredRegistrar?: string | null): string {
        return resolveRegistrarKeyForDomain(domain, preferredRegistrar);
    }
}

export const domainRegistrarService = new DomainRegistrarService();

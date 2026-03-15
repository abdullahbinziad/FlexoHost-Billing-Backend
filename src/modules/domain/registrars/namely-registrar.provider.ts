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
    RegisterNameserverResult,
    RenewDomainParams,
    RenewDomainResult,
    TldPriceItem,
    TransferDomainParams,
    TransferDomainResult,
    TransferStatusResult,
} from '../registrar/registrar.types';
import { RegistrarError } from '../registrar/registrar.types';

const REGISTRAR_NAME = 'namely';

function unsupported(command: string): never {
    throw new RegistrarError({
        registrar: REGISTRAR_NAME,
        command,
        message: 'Namely registrar provider skeleton is registered but not implemented yet.',
    });
}

/**
 * Skeleton provider showing how additional registrars plug into the shared registry/service layer.
 * Intentionally not mapped to live TLDs yet to avoid accidental production traffic.
 */
export class NamelyRegistrarProvider implements IRegistrarProvider {
    readonly name = REGISTRAR_NAME;

    async checkAvailability(_domains: string[]): Promise<DomainAvailabilityResult[]> { return unsupported('checkAvailability'); }
    async registerDomain(_params: RegisterDomainParams): Promise<RegisterDomainResult> { return unsupported('registerDomain'); }
    async transferDomain(_params: TransferDomainParams): Promise<TransferDomainResult> { return unsupported('transferDomain'); }
    async renewDomain(_params: RenewDomainParams): Promise<RenewDomainResult> { return unsupported('renewDomain'); }
    async getDomainInformation(_domain: string): Promise<DomainInformation> { return unsupported('getDomainInformation'); }
    async getNameservers(_domain: string): Promise<string[]> { return unsupported('getNameservers'); }
    async saveNameservers(_domain: string, _nameservers: string[]): Promise<void> { return unsupported('saveNameservers'); }
    async getRegistrarLock(_domain: string): Promise<boolean> { return unsupported('getRegistrarLock'); }
    async saveRegistrarLock(_domain: string, _locked: boolean): Promise<void> { return unsupported('saveRegistrarLock'); }
    async getContactDetails(_domain: string): Promise<DomainContactDetails> { return unsupported('getContactDetails'); }
    async saveContactDetails(_domain: string, _contacts: Partial<DomainContactDetails>): Promise<void> { return unsupported('saveContactDetails'); }
    async getDns(_domain: string): Promise<DnsRecord[]> { return unsupported('getDns'); }
    async saveDns(_domain: string, _records: DnsRecord[]): Promise<void> { return unsupported('saveDns'); }
    async getEppCode(_domain: string, _options?: GetEppCodeParams): Promise<GetEppCodeResult> { return unsupported('getEppCode'); }
    async registerNameserver(_hostname: string, _ip: string): Promise<RegisterNameserverResult> { return unsupported('registerNameserver'); }
    async modifyNameserver(_hostnameOrId: string, _ips: string[]): Promise<void> { return unsupported('modifyNameserver'); }
    async deleteNameserver(_hostnameOrId: string): Promise<void> { return unsupported('deleteNameserver'); }
    async syncDomain(_domainNameOrId: string): Promise<DomainInformation> { return unsupported('syncDomain'); }
    async syncTransfer(_domain: string): Promise<TransferStatusResult> { return unsupported('syncTransfer'); }
    async getTldPricing(_tlds?: string[]): Promise<TldPriceItem[]> { return unsupported('getTldPricing'); }
    async getAccountBalance(): Promise<AccountBalanceResult> { return unsupported('getAccountBalance'); }
    async getOrderStatus(_orderId: string): Promise<OrderStatusResult> { return unsupported('getOrderStatus'); }
    async listDomains(): Promise<{ domain: string; [k: string]: unknown }[]> { return unsupported('listDomains'); }
    async isProcessing(): Promise<boolean> { return unsupported('isProcessing'); }
}

export const namelyRegistrarProvider = new NamelyRegistrarProvider();

/**
 * WHMCS-style registrar provider abstraction.
 * Capability map for domain registrar operations; implement per-registrar (e.g. Dynadot).
 */

/** Normalized registrar error; never expose API keys or secrets. */
export interface RegistrarErrorDetails {
    registrar: string;
    command: string;
    domain?: string;
    message: string;
    registrarCode?: string | number;
    rawSafeSummary?: string;
}

export class RegistrarError extends Error {
    readonly registrar: string;
    readonly command: string;
    readonly domain?: string;
    readonly registrarCode?: string | number;
    readonly rawSafeSummary?: string;
    readonly statusCode?: number;

    constructor(details: RegistrarErrorDetails & { statusCode?: number }) {
        super(details.message);
        this.name = 'RegistrarError';
        this.registrar = details.registrar;
        this.command = details.command;
        this.domain = details.domain;
        this.registrarCode = details.registrarCode;
        this.rawSafeSummary = details.rawSafeSummary;
        this.statusCode = details.statusCode;
    }
}

// ---------- Availability ----------
export interface DomainAvailabilityResult {
    domain: string;
    available: boolean;
    price?: number;
    currency?: string;
    premium?: boolean;
    raw?: Record<string, unknown>;
}

// ---------- Register ----------
export interface RegisterDomainParams {
    domain: string;
    years: number;
    registrantContactId?: string;
    adminContactId?: string;
    technicalContactId?: string;
    billingContactId?: string;
    currency?: string;
    coupon?: string;
    language?: string;
}

export interface RegisterDomainResult {
    success: boolean;
    domain: string;
    expirationDate?: Date;
    orderId?: string;
    raw?: Record<string, unknown>;
}

// ---------- Transfer ----------
export interface TransferDomainParams {
    domain: string;
    authCode: string;
    registrantContactId?: string;
    adminContactId?: string;
    technicalContactId?: string;
    billingContactId?: string;
    currency?: string;
    coupon?: string;
}

export interface TransferDomainResult {
    success: boolean;
    domain: string;
    orderId?: string;
    raw?: Record<string, unknown>;
}

export interface TransferStatusResult {
    status: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'WAITING' | 'AUTH_CODE_NEEDED';
    orderId?: string;
    message?: string;
    reason?: string;
    expiresAt?: Date;
    eppStatusCodes?: string[];
    raw?: Record<string, unknown>;
}

// ---------- Renew ----------
export interface RenewDomainParams {
    domain: string;
    years: number;
    currentExpiryYear?: number;
    currency?: string;
    coupon?: string;
    skipIfLateFee?: boolean;
}

export interface RenewDomainResult {
    success: boolean;
    domain: string;
    expirationDate?: Date;
    raw?: Record<string, unknown>;
}

// ---------- Domain information ----------
export interface DomainInformation {
    domain: string;
    status: string;
    expiryDate: Date;
    registrationDate?: Date;
    nameservers: string[];
    contacts?: {
        registrant?: { id?: string; [k: string]: unknown };
        admin?: { id?: string; [k: string]: unknown };
        tech?: { id?: string; [k: string]: unknown };
        billing?: { id?: string; [k: string]: unknown };
    };
    locked: boolean;
    privacy?: string;
    hold?: boolean;
    disabled?: boolean;
    renewOption?: string;
    raw?: Record<string, unknown>;
}

// ---------- Contacts ----------
export interface RegistrarContact {
    id?: string;
    organization?: string;
    name?: string;
    email?: string;
    phonecc?: string;
    phonenum?: string;
    faxcc?: string;
    faxnum?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    raw?: Record<string, unknown>;
}

export interface DomainContactDetails {
    registrant: RegistrarContact;
    admin: RegistrarContact;
    tech: RegistrarContact;
    billing: RegistrarContact;
}

// ---------- DNS ----------
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'forward' | 'stealth' | 'email';

export interface DnsRecord {
    type: DnsRecordType;
    name?: string;  // subdomain or @ for apex
    value: string;
    priority?: number;  // MX distance / main_recordx
    ttl?: number;
}

// ---------- EPP ----------
export interface GetEppCodeParams {
    newCode?: boolean;
    unlockForTransfer?: boolean;
}

export interface GetEppCodeResult {
    eppCode: string;
    raw?: Record<string, unknown>;
}

// ---------- Child nameservers ----------
export interface RegisterNameserverResult {
    success: boolean;
    hostname: string;
    raw?: Record<string, unknown>;
}

// ---------- TLD pricing ----------
export interface TldPriceItem {
    tld: string;
    register?: number;
    renew?: number;
    transfer?: number;
    currency: string;
    raw?: Record<string, unknown>;
}

// ---------- Extra (account/order) ----------
export interface AccountBalanceResult {
    balance: number;
    currency?: string;
    raw?: Record<string, unknown>;
}

export interface OrderStatusResult {
    orderId: string;
    status: string;
    raw?: Record<string, unknown>;
}

/** WHMCS-style registrar provider interface. */
export interface IRegistrarProvider {
    readonly name: string;

    checkAvailability(domains: string[]): Promise<DomainAvailabilityResult[]>;

    registerDomain(params: RegisterDomainParams): Promise<RegisterDomainResult>;
    transferDomain(params: TransferDomainParams): Promise<TransferDomainResult>;
    renewDomain(params: RenewDomainParams): Promise<RenewDomainResult>;

    getDomainInformation(domain: string): Promise<DomainInformation>;
    getNameservers(domain: string): Promise<string[]>;
    saveNameservers(domain: string, nameservers: string[]): Promise<void>;

    getRegistrarLock(domain: string): Promise<boolean>;
    saveRegistrarLock(domain: string, locked: boolean): Promise<void>;

    getContactDetails(domain: string): Promise<DomainContactDetails>;
    saveContactDetails(domain: string, contacts: Partial<DomainContactDetails>): Promise<void>;

    getDns(domain: string): Promise<DnsRecord[]>;
    saveDns(domain: string, records: DnsRecord[]): Promise<void>;

    getEppCode(domain: string, options?: GetEppCodeParams): Promise<GetEppCodeResult>;

    registerNameserver(hostname: string, ip: string): Promise<RegisterNameserverResult>;
    modifyNameserver(hostnameOrId: string, ips: string[]): Promise<void>;
    deleteNameserver(hostnameOrId: string): Promise<void>;

    syncDomain(domainNameOrId: string): Promise<DomainInformation>;
    syncTransfer(domain: string): Promise<TransferStatusResult>;

    getTldPricing(tlds?: string[]): Promise<TldPriceItem[]>;

    // Optional admin helpers
    getAccountBalance?(): Promise<AccountBalanceResult>;
    getOrderStatus?(orderId: string): Promise<OrderStatusResult>;
    listDomains?(): Promise<{ domain: string; [k: string]: unknown }[]>;
    isProcessing?(): Promise<boolean>;
}

export interface DomainRegistrationRequest {
    domainName: string;
    periodYears: number;
    nameservers: string[];
    contacts: any;
}

export interface DomainTransferRequest {
    domainName: string;
    eppCode: string;
}

export interface IDomainRegistrarProvider {
    registerDomain(req: DomainRegistrationRequest): Promise<{ remoteId: string }>;
    requestTransfer(req: DomainTransferRequest): Promise<{ remoteId: string }>;
    getTransferStatus(domainName: string): Promise<{ status: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED'; reason?: string; expiresAt?: Date; eppStatusCodes?: string[] }>;
    getDomainInfo(domainName: string): Promise<{ status: string; expiresAt: Date; eppStatusCodes: string[] }>;
}

export interface HostingAccountRequest {
    domain: string;
    packageId: string;
    serverLocation?: string;
}

export interface IHostingPanelProvider {
    createAccount(req: HostingAccountRequest): Promise<{ remoteId: string, username: string, ip: string, nameservers: string[] }>;
    suspendAccount(remoteId: string, reason?: string): Promise<boolean>;
    unsuspendAccount(remoteId: string): Promise<boolean>;
    terminateAccount(remoteId: string): Promise<boolean>;
}

export interface VpsInstanceRequest {
    region: string;
    planId: string;
    osImage: string;
}

export interface IVpsProvider {
    createInstance(req: VpsInstanceRequest): Promise<{ remoteId: string, ipAddresses: string[] }>;
    powerOff(remoteId: string): Promise<boolean>;
    start(remoteId: string): Promise<boolean>;
    destroy(remoteId: string): Promise<boolean>;
}

export interface EmailTenantRequest {
    domain: string;
    mailboxCount: number;
}

export interface IEmailProvider {
    createTenantOrPlan(req: EmailTenantRequest): Promise<{ remoteId: string }>;
    suspendPlan(remoteId: string): Promise<boolean>;
    restorePlan(remoteId: string): Promise<boolean>;
    cancelPlan(remoteId: string): Promise<boolean>;
}

export interface LicenseIssueRequest {
    productName: string;
}

export interface ILicenseProvider {
    issueLicense(req: LicenseIssueRequest): Promise<{ remoteId: string, licenseKey: string }>;
    disableLicense(remoteId: string): Promise<boolean>;
    enableLicense(remoteId: string): Promise<boolean>;
}

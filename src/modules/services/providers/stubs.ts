import {
    IHostingPanelProvider,
    IVpsProvider,
    IEmailProvider,
    ILicenseProvider,
    HostingAccountRequest,
    VpsInstanceRequest,
    EmailTenantRequest,
    LicenseIssueRequest
} from './interfaces';

export class HostingPanelStub implements IHostingPanelProvider {
    async createAccount(_req: HostingAccountRequest) {
        return {
            remoteId: `acc_${Date.now()}`,
            username: `u${Math.floor(Math.random() * 10000)}`,
            ip: '192.168.1.100',
            nameservers: ['ns1.example.com', 'ns2.example.com']
        };
    }
    async suspendAccount(_remoteId: string, _reason?: string) { return true; }
    async unsuspendAccount(_remoteId: string) { return true; }
    async terminateAccount(_remoteId: string) { return true; }
}

export class VpsProviderStub implements IVpsProvider {
    async createInstance(_req: VpsInstanceRequest) {
        return {
            remoteId: `vps_${Date.now()}`,
            ipAddresses: ['10.0.0.5']
        };
    }
    async powerOff(_remoteId: string) { return true; }
    async start(_remoteId: string) { return true; }
    async destroy(_remoteId: string) { return true; }
}

export class EmailProviderStub implements IEmailProvider {
    async createTenantOrPlan(_req: EmailTenantRequest) {
        return { remoteId: `mail_${Date.now()}` };
    }
    async suspendPlan(_remoteId: string) { return true; }
    async restorePlan(_remoteId: string) { return true; }
    async cancelPlan(_remoteId: string) { return true; }
}

export class LicenseProviderStub implements ILicenseProvider {
    async issueLicense(_req: LicenseIssueRequest) {
        return {
            remoteId: `lic_${Date.now()}`,
            licenseKey: `FLEXO-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
        };
    }
    async disableLicense(_remoteId: string) { return true; }
    async enableLicense(_remoteId: string) { return true; }
}

export const hostingPanelProvider = new HostingPanelStub();
export const vpsProvider = new VpsProviderStub();
export const emailProvider = new EmailProviderStub();
export const licenseProvider = new LicenseProviderStub();

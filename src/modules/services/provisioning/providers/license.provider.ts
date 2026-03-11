import { ServiceType } from '../../types/enums';
import type { IProvisioningProvider, ProvisioningContext, ProvisioningResult } from '../types';
import { licenseProvider } from '../../providers/stubs';

export class LicenseProvisioningProvider implements IProvisioningProvider {
    readonly type = ServiceType.LICENSE;

    async provision(_ctx: ProvisioningContext): Promise<ProvisioningResult> {
        try {
            const res = await licenseProvider.issueLicense({
                productName: 'FlexoHost Standard License',
            });

            const details: Record<string, unknown> = {
                productName: 'FlexoHost Standard License',
                licenseKeyHash: 'STUBHASH-NEVER-RAW-ABC',
                displayLast4: 'WXYZ',
                activationLimit: 1,
                activationsUsed: 0,
                entitlements: ['core', 'updates'],
            };

            return {
                success: true,
                remoteId: res.remoteId,
                providerName: 'StubLicense',
                details,
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message || 'License provisioning failed',
            };
        }
    }
}

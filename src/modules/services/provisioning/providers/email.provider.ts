import { ServiceType } from '../../types/enums';
import type { IProvisioningProvider, ProvisioningContext, ProvisioningResult } from '../types';
import { emailProvider } from '../../providers/stubs';

export class EmailProvisioningProvider implements IProvisioningProvider {
    readonly type = ServiceType.EMAIL;

    async provision(ctx: ProvisioningContext): Promise<ProvisioningResult> {
        const { orderItem } = ctx;
        const config = orderItem?.configSnapshot || {};
        const domain = config.domain || 'unknown.com';

        try {
            const res = await emailProvider.createTenantOrPlan({
                domain,
                mailboxCount: 10,
            });

            const details: Record<string, unknown> = {
                domain,
                provider: 'StubMail',
                mailboxCount: 10,
                mailboxes: [],
            };

            return {
                success: true,
                remoteId: res.remoteId,
                providerName: 'StubMail',
                details,
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message || 'Email provisioning failed',
            };
        }
    }
}

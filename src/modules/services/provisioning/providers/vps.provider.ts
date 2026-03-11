import { ServiceType } from '../../types/enums';
import type { IProvisioningProvider, ProvisioningContext, ProvisioningResult } from '../types';
import { vpsProvider } from '../../providers/stubs';

export class VpsProvisioningProvider implements IProvisioningProvider {
    readonly type = ServiceType.VPS;

    async provision(ctx: ProvisioningContext): Promise<ProvisioningResult> {
        const { orderItem } = ctx;
        const config = orderItem?.configSnapshot || {};
        const region = config.region || 'us-east-1';

        try {
            const res = await vpsProvider.createInstance({
                region,
                planId: orderItem?.productId || '',
                osImage: 'ubuntu-20.04',
            });

            const details: Record<string, unknown> = {
                provider: 'StubCloud',
                region,
                plan: { cpuCores: 2, ramMb: 4096, diskGb: 80 },
                osImage: 'ubuntu-20.04',
            };

            return {
                success: true,
                remoteId: res.remoteId,
                providerName: 'StubCloud',
                details,
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message || 'VPS provisioning failed',
            };
        }
    }
}

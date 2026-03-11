import { ServiceType } from '../../types/enums';
import type { IProvisioningProvider, ProvisioningContext, ProvisioningResult } from '../types';
import { orderService } from '../../../order/order.service';

export class HostingProvisioningProvider implements IProvisioningProvider {
    readonly type = ServiceType.HOSTING;

    async provision(ctx: ProvisioningContext): Promise<ProvisioningResult> {
        const { orderItem, order, client } = ctx;
        const clientEmail = (client as any)?.contactEmail || (order as any)?.client?.email || '';

        try {
            const result = await orderService.createHostingAccountForOrderItem(
                orderItem,
                order,
                clientEmail,
                { updateOrderItemMeta: true, sendWelcomeEmail: true }
            );

            return {
                success: true,
                remoteId: result.accountUsername,
                providerName: 'whm',
                details: result.details,
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message || 'Hosting provisioning failed',
            };
        }
    }
}

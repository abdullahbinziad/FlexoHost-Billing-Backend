/**
 * Usage sync scheduler: fetches disk/bandwidth usage from WHM for all hosting services
 * and updates HostingServiceDetails.usageSnapshot. Trigger via POST /admin/trigger/usage-sync
 * (e.g. from external cron every 15–30 min).
 */
import HostingServiceDetails from '../models/hosting-details.model';
import { hostingDetailsRepository } from '../repositories';
import { serverService } from '../../server/server.service';

const CONCURRENCY = 5;

async function runInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>): Promise<void> {
    for (let start = 0; start < items.length; start += batchSize) {
        const batch = items.slice(start, start + batchSize);
        await Promise.all(batch.map(fn));
    }
}

export class UsageSyncScheduler {
    /**
     * Refresh usageSnapshot for all hosting details that have accountUsername and serverId.
     * Uses concurrency limit to avoid overloading WHM.
     */
    async processUsageSync(): Promise<{ processed: number; failed: number; errors: string[] }> {
        const details = await HostingServiceDetails.find({
            accountUsername: { $exists: true, $ne: '' },
            serverId: { $exists: true, $ne: null },
        })
            .select('serviceId accountUsername serverId')
            .lean()
            .exec();

        const errors: string[] = [];
        let processed = 0;
        let failed = 0;

        await runInBatches(details, CONCURRENCY, async (d: any) => {
            const serviceId = d.serviceId?.toString?.() || d.serviceId;
            const serverId = d.serverId?.toString?.() || d.serverId;
            const accountUsername = d.accountUsername;
            if (!serviceId || !serverId || !accountUsername) {
                failed++;
                return;
            }
            try {
                const client = await serverService.getWhmClient(serverId);
                if (!client) {
                    failed++;
                    errors.push(`Service ${serviceId}: no WHM client for server ${serverId}`);
                    return;
                }
                const raw = await client.getAccountUsage(accountUsername);
                const updatedAt = new Date();
                const usageSnapshot = {
                    diskUsedMb: raw.disk?.usedMb ?? 0,
                    diskLimitMb: raw.disk?.limitMb ?? 0,
                    bandwidthUsedMb: raw.bandwidth?.usedMb ?? 0,
                    bandwidthLimitMb: raw.bandwidth?.limitMb ?? 0,
                    updatedAt,
                };
                await hostingDetailsRepository.updateByServiceId(serviceId, { usageSnapshot } as any);
                processed++;
            } catch (err: any) {
                failed++;
                errors.push(`Service ${serviceId}: ${err?.message || 'Unknown error'}`);
            }
        });

        return { processed, failed, errors };
    }
}

const usageSyncScheduler = new UsageSyncScheduler();
export default usageSyncScheduler;

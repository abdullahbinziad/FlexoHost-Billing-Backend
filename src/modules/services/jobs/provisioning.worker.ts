import mongoose from 'mongoose';
import {
    provisioningJobRepository,
    serviceRepository,
} from '../repositories';
import Order from '../../order/order.model';
import Client from '../../client/client.model';
import { orderService } from '../../order/order.service';
import * as emailService from '../../email/email.service';
import { sendHostingAccountCreatedEmail } from '../core/hosting-account-email.service';
import { ProvisioningJobStatus, ServiceStatus, ServiceType, normalizeBillingCycle } from '../types/enums';
import { getNextSequence, formatSequenceId } from '../../../models/counter.model';
import { DEFAULT_CURRENCY } from '../../../config/currency.config';
import { provisioningProviderRegistry } from '../provisioning/provider-registry';
import { getDetailPersister } from '../provisioning/detail-persisters';
import { registerProvisioningProviders } from '../provisioning/providers';
import type { ProvisioningContext } from '../provisioning/types';
import { computeInitialNextDueDate } from '../utils/billing-cycle.util';
import logger from '../../../utils/logger';

let providersRegistered = false;

function ensureProvidersRegistered(): void {
    if (!providersRegistered) {
        registerProvisioningProviders();
        providersRegistered = true;
    }
}

export class ProvisioningWorker {
    /**
     * Main cron loop: process queued jobs using type-agnostic provider registry.
     */
    async processQueuedJobs(): Promise<number> {
        ensureProvidersRegistered();

        const lockedJobs = await provisioningJobRepository.lockBatchForProcessing(10, 5 * 60 * 1000);

        if (lockedJobs.length === 0) return 0;

        for (const job of lockedJobs) {
            try {
                await this.processSingleJob(job);
            } catch (err: any) {
                const newAttempts = job.attempts;
                const finalStatus = newAttempts >= job.maxAttempts
                    ? ProvisioningJobStatus.FAILED
                    : ProvisioningJobStatus.QUEUED;

                await provisioningJobRepository.updateStatus((job._id as unknown) as string, finalStatus, {
                    lastError: err.message || 'Unknown error during job execution',
                });
            }
        }

        return lockedJobs.length;
    }

    private async processSingleJob(job: any): Promise<void> {
        const orderItemId = job.orderItemId.toString();
        const rawType = job.serviceType;
        const serviceType = (typeof rawType === 'string' ? rawType.toUpperCase() : rawType) as ServiceType;

        logger.info(`[Provisioning] Processing job ${job._id} orderItem=${orderItemId} type=${serviceType}.`);

        // 1. Idempotency: if Service exists and is not awaiting reprovision, mark job SUCCESS
        let service = await serviceRepository.findByOrderItemId(orderItemId);
        const isReprovision = !!service && service.status === ServiceStatus.PROVISIONING;
        if (service && !isReprovision) {
            await provisioningJobRepository.updateStatus(job._id as string, ProvisioningJobStatus.SUCCESS);
            return;
        }

        // 2. Load order, order item, client
        const order = await Order.findById(job.orderId).exec();
        if (!order) throw new Error(`Order not found for Job: ${job.orderId}`);

        const orderItem = await mongoose.model('OrderItem').findById(job.orderItemId).exec() as any;
        if (!orderItem) throw new Error(`OrderItem not found: ${job.orderItemId}`);

        const client = await Client.findById(job.clientId).exec();
        if (!client) throw new Error(`Client not found for Job: ${job.clientId}`);

        // 3. Resolve provider (registry is keyed by uppercase enum e.g. HOSTING)
        const provider = provisioningProviderRegistry.get(serviceType);
        if (!provider) {
            throw new Error(`No provisioning provider registered for type: ${serviceType}. Registered: ${provisioningProviderRegistry.getAllTypes().join(', ')}`);
        }

        // 4. Create Service record with PROVISIONING status if first run.
        if (!service) {
            const svcSeq = await getNextSequence('service');
            const billingCycle = normalizeBillingCycle(orderItem.billingCycle);
            service = await serviceRepository.create({
                serviceNumber: formatSequenceId('SVC', svcSeq),
                clientId: job.clientId,
                userId: order.userId,
                orderId: job.orderId,
                orderItemId: job.orderItemId,
                invoiceId: job.invoiceId,
                type: serviceType,
                status: ServiceStatus.PROVISIONING,
                billingCycle,
                currency: order.currency || DEFAULT_CURRENCY,
                priceSnapshot: {
                    setup: 0,
                    recurring: orderItem.pricingSnapshot?.total || 0,
                    discount: 0,
                    tax: 0,
                    total: orderItem.pricingSnapshot?.total || 0,
                    currency: order.currency || DEFAULT_CURRENCY,
                },
                autoRenew: true,
                nextDueDate: computeInitialNextDueDate(new Date(), billingCycle),
            });
            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
            auditLogSafe({
                message: `Service ${(service as any).serviceNumber} created (${serviceType}, PROVISIONING)`,
                type: 'service_created',
                category: 'service',
                actorType: 'system',
                source: 'cron',
                clientId: (job.clientId as any)?.toString(),
                serviceId: (service._id as any)?.toString(),
                orderId: (job.orderId as any)?.toString(),
                invoiceId: (job.invoiceId as any)?.toString(),
                meta: { serviceType },
            });
        }

        const serviceId = (service._id as unknown) as string;

        try {
            // 5. Call provider (selection + external API)
            const ctx: ProvisioningContext = {
                order,
                orderItem,
                client,
                service,
                reprovision: isReprovision,
            };

            const result = await provider.provision(ctx);

            if (!result.success) {
                throw new Error(result.error || 'Provisioning failed');
            }

            // 6. Persist type-specific details
            const persister = getDetailPersister(serviceType);
            if (persister && result.details && Object.keys(result.details).length > 0) {
                await persister(service._id as mongoose.Types.ObjectId, result.details);
            }

            // 7. Update service ACTIVE and provisioning meta
            await serviceRepository.updateStatus(serviceId, ServiceStatus.ACTIVE, {
                suspendedAt: null as any,
                terminatedAt: null as any,
                provisioning: {
                    provider: result.providerName || 'StubProvider',
                    remoteId: result.remoteId ?? undefined,
                    lastSyncedAt: new Date(),
                },
            });

            const clientEmail = (client as any)?.contactEmail || '';
            const customerName = client ? `${(client as any).firstName || ''} ${(client as any).lastName || ''}`.trim() || 'Customer' : 'Customer';

            if (serviceType === ServiceType.HOSTING && clientEmail && result.password) {
                sendHostingAccountCreatedEmail(service._id, result.password).catch(() => {});
            }

            if (serviceType === ServiceType.DOMAIN && result.details && clientEmail) {
                const details = result.details as Record<string, any>;
                const domainName = details.domainName || 'unknown';
                const years = orderItem?.configSnapshot?.years ?? orderItem?.configSnapshot?.period ?? 1;
                const registrationPeriod = years === 1 ? '1 year' : `${years} years`;
                emailService.sendDomainRegistrationEmail(clientEmail, customerName, {
                    domain: domainName,
                    registrationPeriod,
                    registrationDate: new Date().toLocaleDateString(),
                    autoRenewEnabled: true,
                }).catch(() => {});
            }

            await provisioningJobRepository.updateStatus(job._id as string, ProvisioningJobStatus.SUCCESS);

            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
            const clientIdStr = (client as any)?._id?.toString();
            const eventType =
                serviceType === ServiceType.HOSTING
                    ? 'hosting_provisioned'
                    : serviceType === ServiceType.VPS
                        ? 'vps_provisioned'
                        : serviceType === ServiceType.DOMAIN
                            ? ((orderItem as any)?.actionType === 'TRANSFER' ? 'domain_transferred' : 'domain_registered')
                            : 'service_created';
            auditLogSafe({
                message: `${serviceType} provisioned for client`,
                type: eventType as any,
                category: serviceType === ServiceType.DOMAIN ? 'domain' : 'service',
                actorType: 'system',
                source: 'cron',
                clientId: clientIdStr,
                serviceId: serviceId,
                orderId: job.orderId?.toString(),
                meta: { provider: result.providerName },
            });

            await orderService.finalizeOrderIfProvisioned(job.orderId.toString());
        } catch (provErr: any) {
            const errMsg = provErr?.message || 'Unknown error';
            logger.error(`[Provisioning] Job ${job._id} failed for orderItem ${job.orderItemId}: ${errMsg}`, provErr);
            await serviceRepository.updateStatus(serviceId, ServiceStatus.FAILED, {
                provisioning: {
                    lastError: errMsg,
                },
            });
            throw provErr;
        }
    }
}

export default new ProvisioningWorker();

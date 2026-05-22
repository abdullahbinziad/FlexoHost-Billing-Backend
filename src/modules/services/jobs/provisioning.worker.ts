import mongoose from 'mongoose';
import {
    provisioningJobRepository,
    serviceRepository,
} from '../repositories';
import Order from '../../order/order.model';
import Client from '../../client/client.model';
import { orderService } from '../../order/order.service';
import * as emailService from '../../email/email.service';
import serviceNotificationService from '../core/service-notification.service';
import { ProvisioningJobStatus, ServiceStatus, ServiceType, normalizeBillingCycle } from '../types/enums';
import { getNextSequence, formatSequenceId } from '../../../models/counter.model';
import { DEFAULT_CURRENCY } from '../../../config/currency.config';
import { provisioningProviderRegistry } from '../provisioning/provider-registry';
import { getDetailPersister } from '../provisioning/detail-persisters';
import { registerProvisioningProviders } from '../provisioning/providers';
import type { ProvisioningContext } from '../provisioning/types';
import { computeInitialNextDueDate } from '../utils/billing-cycle.util';
import logger from '../../../utils/logger';
import Invoice from '../../invoice/invoice.model';
import { InvoiceStatus } from '../../invoice/invoice.interface';
import config from '../../../config';
import domainService from '../../domain/domain.service';
import { normalizeDomainFqdn } from '../../domain/utils/domain-display';
import { adminAlertService } from '../../notification/admin-alert.service';

let providersRegistered = false;
const PROVISIONING_STEP_TIMEOUT_MS = config.provisioning.stepTimeoutMs;

function ensureProvidersRegistered(): void {
    if (!providersRegistered) {
        registerProvisioningProviders();
        providersRegistered = true;
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race<T>([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
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

        if (job.invoiceId) {
            const inv = await Invoice.findById(job.invoiceId).select('status balanceDue').lean();
            if (
                !inv ||
                inv.status !== InvoiceStatus.PAID ||
                (inv.balanceDue ?? 0) > 0
            ) {
                logger.warn(
                    `[Provisioning] Job ${job._id} deferred: invoice ${job.invoiceId} not fully paid (status=${inv?.status}).`
                );
                await provisioningJobRepository.releaseLockRequeueWithoutRetryPenalty(
                    job._id as string,
                    typeof job.attempts === 'number' ? job.attempts : 0
                );
                return;
            }
        }

        // 1. Idempotency: if Service exists and is not awaiting reprovision, mark job SUCCESS
        let service = await serviceRepository.findByOrderItemId(orderItemId);
        const isReprovision = !!service && service.status === ServiceStatus.PROVISIONING;
        const shouldSkipProvision = !!service && ![ServiceStatus.PENDING, ServiceStatus.PROVISIONING, ServiceStatus.FAILED].includes(service.status);
        if (shouldSkipProvision) {
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
        } else if (service.status !== ServiceStatus.PROVISIONING) {
            await serviceRepository.updateStatus((service._id as unknown) as string, ServiceStatus.PROVISIONING);
            service = await serviceRepository.findByOrderItemId(orderItemId);
        }

        if (!service) {
            throw new Error(`Service not found for order item ${orderItemId} after provisioning setup`);
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

            const result = await withTimeout(
                provider.provision(ctx),
                PROVISIONING_STEP_TIMEOUT_MS,
                `Provisioning timed out after ${Math.floor(PROVISIONING_STEP_TIMEOUT_MS / 1000)}s`
            );

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
                cancelledAt: null as any,
                provisioning: {
                    provider: result.providerName || 'StubProvider',
                    remoteId: result.remoteId ?? undefined,
                    lastSyncedAt: new Date(),
                },
            });

            const clientEmail = (client as any)?.contactEmail || '';
            const customerName = client ? `${(client as any).firstName || ''} ${(client as any).lastName || ''}`.trim() || 'Customer' : 'Customer';

            if (serviceType === ServiceType.HOSTING) {
                serviceNotificationService.sendTemplateForService({
                    serviceId,
                    templateKey: 'service.hosting_account_created',
                    source: 'system',
                    password: result.password,
                }).catch((error: any) => {
                    logger.warn(`[Provisioning] Hosting account notification failed for service ${serviceId}: ${error?.message || error}`);
                });
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
            adminAlertService.notify({
                permission: serviceType === ServiceType.DOMAIN ? 'notifications:domain_alerts' : 'notifications:service_alerts',
                category: serviceType === ServiceType.DOMAIN ? 'domain' : 'service',
                severity: 'medium',
                source: 'cron',
                title: `${serviceType} provisioned`,
                message: `${serviceType} provisioning completed for service ${(service as any).serviceNumber || serviceId}.`,
                linkPath: serviceType === ServiceType.DOMAIN
                    ? `/admin/clients/${clientIdStr}/domains/${serviceId}`
                    : `/admin/clients/${clientIdStr}/hosting/${serviceId}`,
                linkLabel: 'View service',
                clientId: clientIdStr,
                serviceId,
                orderId: job.orderId?.toString(),
                invoiceId: job.invoiceId?.toString(),
                meta: { provider: result.providerName, serviceType },
            }).catch((alertErr: any) => {
                logger.warn('[Provisioning] Admin success alert failed:', alertErr?.message || alertErr);
            });

            await orderService.finalizeOrderIfProvisioned(job.orderId.toString());
        } catch (provErr: any) {
            const errMsg = provErr?.message || 'Unknown error';
            logger.error(`[Provisioning] Job ${job._id} failed for orderItem ${job.orderItemId}: ${errMsg}`, provErr);
            const failedUpdate: Record<string, any> = {
                provisioning: {
                    ...(service.provisioning || {}),
                    lastError: errMsg,
                },
            };
            if (serviceType === ServiceType.DOMAIN && domainService.isRecoverableDomainProvisioningError(errMsg)) {
                const cfg = (orderItem as any)?.configSnapshot || {};
                const recoverableDomainName = normalizeDomainFqdn(String(cfg.domainName || cfg.domain || '').trim());
                failedUpdate.meta = {
                    ...(service.meta || {}),
                    domainRecoveryAvailable: true,
                    domainRecoveryReason: errMsg,
                    recoverableDomainName: recoverableDomainName || undefined,
                    recoveredRegistrar: cfg.registrar || undefined,
                };
            }
            await serviceRepository.updateStatus(serviceId, ServiceStatus.FAILED, failedUpdate);
            adminAlertService.notify({
                permission: serviceType === ServiceType.DOMAIN ? 'notifications:domain_alerts' : 'notifications:service_alerts',
                category: serviceType === ServiceType.DOMAIN ? 'domain' : 'service',
                severity: 'high',
                source: 'cron',
                title: `${serviceType} provisioning failed`,
                message: `${serviceType} provisioning failed for service ${(service as any).serviceNumber || serviceId}: ${errMsg}`,
                linkPath: serviceType === ServiceType.DOMAIN
                    ? `/admin/clients/${(job.clientId as any)?.toString?.()}/domains/${serviceId}`
                    : `/admin/clients/${(job.clientId as any)?.toString?.()}/hosting/${serviceId}`,
                linkLabel: 'View service',
                clientId: (job.clientId as any)?.toString?.(),
                serviceId,
                orderId: job.orderId?.toString(),
                invoiceId: job.invoiceId?.toString(),
                email: {
                    subject: `[Provisioning Alert] ${serviceType} provisioning failed`,
                    html: `<p><strong>${serviceType} provisioning failed</strong></p><p>Service: ${(service as any).serviceNumber || serviceId}</p><p>Error: ${errMsg}</p>`,
                    text: `${serviceType} provisioning failed. Service: ${(service as any).serviceNumber || serviceId}. Error: ${errMsg}`,
                },
                meta: { serviceType, error: errMsg },
            }).catch((alertErr: any) => {
                logger.warn('[Provisioning] Admin failure alert failed:', alertErr?.message || alertErr);
            });
            throw provErr;
        }
    }
}

export default new ProvisioningWorker();

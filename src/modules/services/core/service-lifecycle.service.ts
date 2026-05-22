import mongoose from 'mongoose';
import Service from '../service.model';
import Invoice from '../../invoice/invoice.model';
import ServiceActionJob from '../models/service-action-job.model';
import RenewalLedger from '../models/renewal-ledger.model';
import ServiceAuditLog from '../models/service-audit-log.model';
import DomainServiceDetails from '../models/domain-details.model';
import DomainRenewalJob from '../models/domain-renewal-job.model';
import { ServiceStatus, ServiceActionType, ProvisioningJobStatus, BillingCycle, ServiceType } from '../types/enums';
import { addBillingCycleToDate } from '../utils/billing-cycle.util';
import { InvoiceStatus } from '../../invoice/invoice.interface';
import { auditLogSafe } from '../../activity-log/activity-log.service';
import serviceNotificationService from './service-notification.service';

export class ServiceLifecycleService {
    /**
     * Triggered automatically upon invoice becoming PAID.
     * Evaluates linked suspended services and queues an UNSUSPEND.
     * @param invoiceId 
     */
    async onInvoicePaidUnsuspend(invoiceId: string | mongoose.Types.ObjectId) {
        // 1. Fetch deeply populated invoice
        const invoice = await Invoice.findById(invoiceId).lean().exec();
        if (!invoice) return;

        console.log(`[ServiceLifecycle] Evaluating Paid Invoice: ${invoice.invoiceNumber}`);

        // 2. Identify precisely linked Services mapped in Items
        const mappedServiceIds: mongoose.Types.ObjectId[] = [];
        for (const item of invoice.items) {
            if (item.meta && item.meta.serviceId) {
                mappedServiceIds.push(item.meta.serviceId);
            }
        }

        if (mappedServiceIds.length === 0) return;

        // 3. Evaluate any that are explicitly SUSPENDED that we can restore natively
        const suspendedServices = await Service.find({
            _id: { $in: mappedServiceIds },
            status: ServiceStatus.SUSPENDED
        }).exec();

        for (const svc of suspendedServices) {
            // Restore native configurations bypassing deep validations
            svc.status = ServiceStatus.ACTIVE;
            // Optionally clear logic flag utilizing unset
            svc.meta = svc.meta || {};
            const previousReason = svc.meta.suspendReason;
            svc.meta.suspendReason = undefined;
            svc.meta.unsuspendedAt = new Date();

            await svc.save();

            // Native explicit Audit Log mapping
            try {
                await ServiceAuditLog.create({
                    clientId: svc.clientId,
                    serviceId: svc._id,
                    action: 'UNSUSPEND',
                    beforeSnapshot: { status: ServiceStatus.SUSPENDED, reason: previousReason },
                    afterSnapshot: { status: ServiceStatus.ACTIVE, unsuspendedAt: svc.meta.unsuspendedAt }
                });
            } catch (err) {
                console.error('Failed to log UNSUSPEND audit log:', err);
            }

            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
            auditLogSafe({
                message: `Service ${svc._id} unsuspended after invoice paid`,
                type: 'service_unsuspended',
                category: 'service',
                actorType: 'system',
                source: 'system',
                clientId: (svc.clientId as any)?.toString(),
                serviceId: svc._id.toString(),
                invoiceId: invoice._id.toString(),
            });

            // Queue a Service Action Job for downstream Provider Execution (Unsuspend)
            const jobData = {
                serviceId: svc._id,
                invoiceId: invoice._id,
                action: ServiceActionType.UNSUSPEND,
                status: ProvisioningJobStatus.QUEUED,
            };

            // Use upsert or ignore duplicate key for unique service-action-invoice tuple
            try {
                await ServiceActionJob.create(jobData);
            } catch (err: any) {
                if (err.code !== 11000) {
                    console.error('Failed to create UNSUSPEND service action job: ', err);
                }
            }
        }
    }

    async convertTrialServicesForPaidInvoice(invoiceId: string | mongoose.Types.ObjectId) {
        const invoice = await Invoice.findById(invoiceId).lean().exec();
        if (!invoice) return { converted: 0, unsuspendJobsQueued: 0 };
        if (invoice.status !== InvoiceStatus.PAID || (invoice.balanceDue ?? 0) > 0) {
            return { converted: 0, unsuspendJobsQueued: 0 };
        }

        const ownershipConditions: Record<string, unknown>[] = [{ invoiceId: invoice._id }];
        if (invoice.orderId) {
            ownershipConditions.push({ orderId: invoice.orderId });
        }

        const query: any = {
            type: ServiceType.HOSTING,
            'meta.trialProvisioned': true,
            'meta.provisionedWithoutPayment': true,
            $or: ownershipConditions,
        };

        const services = await Service.find(query).exec();
        let converted = 0;
        let unsuspendJobsQueued = 0;
        const paidAt = new Date();

        for (const svc of services) {
            svc.meta = svc.meta || {};
            svc.meta.trialConvertedAt = paidAt;
            svc.meta.trialConvertedInvoiceId = invoice._id.toString();
            svc.meta.trialProvisioned = false;
            svc.meta.provisionedWithoutPayment = false;
            svc.meta.trialSuspendedAt = undefined;
            svc.meta.suspendReason = undefined;
            svc.meta.lastPaidInvoiceId = invoice._id.toString();
            svc.meta.lastPaidAt = paidAt;
            svc.meta.trialOriginalNextDueDate = svc.nextDueDate;
            svc.nextDueDate = this.addBillingCycle(paidAt, svc.billingCycle as BillingCycle);
            svc.graceUntil = undefined;
            if (svc.status === ServiceStatus.SUSPENDED) {
                svc.status = ServiceStatus.ACTIVE;
                try {
                    await ServiceActionJob.create({
                        serviceId: svc._id,
                        invoiceId: invoice._id,
                        action: ServiceActionType.UNSUSPEND,
                        status: ProvisioningJobStatus.QUEUED,
                    });
                    unsuspendJobsQueued++;
                } catch (err: any) {
                    if (err.code !== 11000) throw err;
                }
            }
            await svc.save();
            converted++;
            auditLogSafe({
                message: `Trial service ${svc._id} converted after invoice ${invoice.invoiceNumber} was paid`,
                type: 'service_activated',
                category: 'service',
                actorType: 'system',
                source: 'system',
                clientId: (svc.clientId as any)?.toString(),
                serviceId: svc._id.toString(),
                invoiceId: invoice._id.toString(),
            });
        }

        return { converted, unsuspendJobsQueued };
    }

    /**
     * Optional Cron Loop Fallback: Find PAID invoices holding services still internally tracked as SUSPENDED.
     * Perfect for race-condition recoveries.
     */
    async processOrphanedSuspensions() {
        const paidRecentInvoices = await Invoice.find({
            status: 'PAID',
            updatedAt: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } // past 3 days search
        }).lean().exec();

        let restoredCount = 0;
        for (const invoice of paidRecentInvoices) {
            await this.onInvoicePaidUnsuspend(invoice._id as mongoose.Types.ObjectId);
            restoredCount++; // Broad increment just tracking execution logic passes
        }

        console.log(`[ServiceLifecycle] Fallback Sweep completed processing over ${restoredCount} isolated active invoices.`);
    }

    /**
     * Compute next billing date efficiently ensuring native alignment.
     */
    addBillingCycle(date: Date, cycle: BillingCycle): Date {
        return addBillingCycleToDate(date, cycle);
    }

    /**
     * Advances Native Service Data after a successful renewal Invoice is paid completely.
     */
    async applyRenewalPayment(invoiceId: string | mongoose.Types.ObjectId) {
        const invoice = await Invoice.findById(invoiceId).lean().exec();
        if (!invoice) return;
        if (invoice.status !== InvoiceStatus.PAID || (invoice.balanceDue ?? 0) > 0) return;

        // Locate renewal service mappings natively.
        const mappedServiceIds: mongoose.Types.ObjectId[] = [];
        const itemMetaByServiceId = new Map<string, Record<string, any>>();
        for (const item of invoice.items) {
            if (item.meta && item.meta.serviceId) {
                mappedServiceIds.push(item.meta.serviceId);
                itemMetaByServiceId.set(item.meta.serviceId.toString(), item.meta);
            }
        }

        if (mappedServiceIds.length === 0) return;

        const servicesToRenew = await Service.find({ _id: { $in: mappedServiceIds } }).exec();

        for (const svc of servicesToRenew) {
            if ([ServiceStatus.TERMINATED, ServiceStatus.CANCELLED].includes(svc.status as ServiceStatus)) {
                await this.markRenewalSkipped(svc, invoice, `Service is ${svc.status}`);
                continue;
            }

            const itemMeta = itemMetaByServiceId.get(svc._id.toString()) || {};
            const metaDueDate = itemMeta.renewalDueDate ? new Date(itemMeta.renewalDueDate) : null;
            const currentDueDate = metaDueDate && !Number.isNaN(metaDueDate.getTime())
                ? metaDueDate
                : svc.nextDueDate;
            // Check renewal_ledger for idempotency based on dueDate
            const ledger = await RenewalLedger.findOne({ serviceId: svc._id, dueDate: currentDueDate }).exec();

            if (ledger && ledger.paidInvoiceId) {
                // Already paid and advanced for this cycle
                continue;
            }

            const nextTargetDate = this.addBillingCycle(currentDueDate, svc.billingCycle as BillingCycle);
            svc.nextDueDate = nextTargetDate;

            svc.graceUntil = undefined;
            svc.meta = svc.meta || {};
            svc.meta.lastPaidInvoiceId = invoice._id.toString();
            svc.meta.lastPaidAt = new Date();

            await svc.save();

            auditLogSafe({
                message: `Service ${svc._id} renewed`,
                type: 'service_renewed',
                category: 'service',
                actorType: 'system',
                source: 'system',
                clientId: (svc.clientId as any)?.toString(),
                serviceId: svc._id.toString(),
                invoiceId: invoice._id.toString(),
            });

            serviceNotificationService.sendTemplateForService({
                serviceId: svc._id.toString(),
                templateKey: 'service.renewed',
                source: 'system',
                previousDueDate: currentDueDate,
                nextDueDate: nextTargetDate,
                invoiceNumber: invoice.invoiceNumber,
            }).catch(() => {});

            // Mark ledger as paid
            if (ledger) {
                ledger.paidAt = new Date();
                ledger.paidInvoiceId = invoice._id as any;
                await ledger.save();
            } else {
                // Create backfilled ledger if it was missing to track it natively
                await RenewalLedger.create({
                    serviceId: svc._id,
                    dueDate: currentDueDate,
                    invoiceId: invoice._id,
                    paidAt: new Date(),
                    paidInvoiceId: invoice._id
                });
            }

            if (svc.type === ServiceType.DOMAIN) {
                await this.processPaidDomainRenewal(svc, invoice, itemMeta, currentDueDate, nextTargetDate);
            }
        }
    }

    private async markRenewalSkipped(svc: any, invoice: any, reason: string): Promise<void> {
        svc.meta = svc.meta || {};
        svc.meta.renewalSkippedReason = reason;
        svc.meta.renewalSkippedInvoiceId = invoice._id.toString();
        svc.meta.renewalSkippedAt = new Date();
        await svc.save();

        auditLogSafe({
            message: `Renewal skipped for service ${svc._id}: ${reason}`,
            type: 'service_renewed',
            category: 'service',
            actorType: 'system',
            source: 'system',
            clientId: (svc.clientId as any)?.toString(),
            serviceId: svc._id.toString(),
            invoiceId: invoice._id.toString(),
            meta: { reason },
        });
    }

    private yearsFromBillingCycle(cycle: BillingCycle): number {
        if (cycle === BillingCycle.BIENNIALLY) return 2;
        if (cycle === BillingCycle.TRIENNIALLY) return 3;
        return 1;
    }

    private async processPaidDomainRenewal(
        svc: any,
        invoice: any,
        itemMeta: Record<string, any>,
        renewedFrom: Date,
        renewedUntil: Date
    ): Promise<void> {
        const details = await DomainServiceDetails.findOne({ serviceId: svc._id }).exec();
        if (!details?.domainName) {
            svc.meta = svc.meta || {};
            svc.meta.domainRenewalStatus = 'failed';
            svc.meta.domainRenewalError = 'Domain details not found';
            await svc.save();
            return;
        }

        if (details.expiresAt && new Date(details.expiresAt).getTime() >= renewedUntil.getTime()) {
            svc.meta = svc.meta || {};
            svc.meta.domainRenewalStatus = 'already_current';
            svc.meta.domainRenewalInvoiceId = invoice._id.toString();
            await svc.save();
            return;
        }

        try {
            const years = this.yearsFromBillingCycle(svc.billingCycle as BillingCycle);
            const idempotencyKey = `domain-renewal:${svc._id.toString()}:${invoice._id.toString()}:${renewedFrom.toISOString()}`;
            const job = await DomainRenewalJob.findOneAndUpdate(
                { idempotencyKey },
                {
                    $setOnInsert: {
                        serviceId: svc._id,
                        domainDetailsId: details._id,
                        invoiceId: invoice._id,
                        clientId: svc.clientId,
                        domainName: details.domainName,
                        registrar: details.registrar,
                        years,
                        currency: svc.currency,
                        renewedFrom,
                        renewedUntil,
                        status: ProvisioningJobStatus.QUEUED,
                        attempts: 0,
                        maxAttempts: 3,
                        idempotencyKey,
                    },
                },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            ).exec();

            const shouldRequeueFailed = job.status === ProvisioningJobStatus.FAILED;
            if (shouldRequeueFailed) {
                job.status = ProvisioningJobStatus.QUEUED;
                job.attempts = 0;
                job.lastError = undefined;
                job.lockedAt = undefined;
                job.lockOwner = undefined;
                await job.save();
            }

            svc.provisioning = svc.provisioning || {};
            svc.meta = svc.meta || {};
            svc.meta.domainRenewalStatus = 'queued';
            svc.meta.domainRenewalJobId = job._id.toString();
            svc.meta.domainRenewalInvoiceId = invoice._id.toString();
            svc.meta.domainRenewedFrom = renewedFrom.toISOString();
            svc.meta.domainRenewedUntil = renewedUntil.toISOString();
            svc.meta.domainRenewalOrderItemId = itemMeta.orderItemId;
            await svc.save();

            auditLogSafe({
                message: `Domain renewal queued for ${details.domainName} after invoice ${invoice.invoiceNumber} was paid`,
                type: 'domain_renewed',
                category: 'domain',
                actorType: 'system',
                source: 'system',
                clientId: (svc.clientId as any)?.toString(),
                serviceId: svc._id.toString(),
                invoiceId: invoice._id.toString(),
                meta: {
                    domain: details.domainName,
                    years,
                    registrar: details.registrar,
                    jobId: job._id.toString(),
                },
            });
        } catch (err: any) {
            svc.provisioning = svc.provisioning || {};
            svc.provisioning.lastError = err?.message || 'Registrar renewal failed';
            svc.meta = svc.meta || {};
            svc.meta.domainRenewalStatus = 'failed';
            svc.meta.domainRenewalInvoiceId = invoice._id.toString();
            svc.meta.domainRenewalError = err?.message || 'Registrar renewal failed';
            svc.meta.domainRenewalFailedAt = new Date();
            await svc.save();

            auditLogSafe({
                message: `Domain renewal failed for ${details.domainName}: ${err?.message || 'Unknown error'}`,
                type: 'domain_renewed',
                category: 'domain',
                actorType: 'system',
                source: 'system',
                status: 'failure',
                severity: 'high',
                clientId: (svc.clientId as any)?.toString(),
                serviceId: svc._id.toString(),
                invoiceId: invoice._id.toString(),
                meta: { domain: details.domainName },
            });
        }
    }
}

export default new ServiceLifecycleService();

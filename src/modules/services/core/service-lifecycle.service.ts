import mongoose from 'mongoose';
import Service from '../service.model';
import Invoice from '../../invoice/invoice.model';
import ServiceActionJob from '../models/service-action-job.model';
import RenewalLedger from '../models/renewal-ledger.model';
import ServiceAuditLog from '../models/service-audit-log.model';
import { ServiceStatus, ServiceActionType, ProvisioningJobStatus, BillingCycle } from '../types/enums';
import { addBillingCycleToDate } from '../utils/billing-cycle.util';

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

        // Locate renewal service mappings natively.
        const mappedServiceIds: mongoose.Types.ObjectId[] = [];
        for (const item of invoice.items) {
            if (item.meta && item.meta.serviceId) {
                mappedServiceIds.push(item.meta.serviceId);
            }
        }

        if (mappedServiceIds.length === 0) return;

        const servicesToRenew = await Service.find({ _id: { $in: mappedServiceIds } }).exec();

        for (const svc of servicesToRenew) {
            const currentDueDate = svc.nextDueDate;
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

            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
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
        }
    }
}

export default new ServiceLifecycleService();

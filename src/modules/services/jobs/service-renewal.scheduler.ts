import mongoose from 'mongoose';
import Service from '../service.model';
import Invoice from '../../invoice/invoice.model';
import ServiceActionJob from '../models/service-action-job.model';
import RenewalLedger from '../models/renewal-ledger.model';
import ServiceAuditLog from '../models/service-audit-log.model';
import { BillingCycle, ServiceStatus, ServiceActionType, ProvisioningJobStatus } from '../types/enums';
import { InvoiceStatus, InvoiceItemType } from '../../invoice/invoice.interface';
import { getNextSequence, formatSequenceId } from '../../../models/counter.model';
import { DEFAULT_CURRENCY } from '../../../config/currency.config';

export class ServiceRenewalScheduler {
    /**
     * Finds active services due for renewal and creates invoices idempotently.
     */
    async processRenewals() {
        // Find services where: status=ACTIVE, autoRenew=true, billingCycle != one-time
        // nextDueDate <= now + leadDays (7 days default)
        const leadDaysOffset = new Date();
        leadDaysOffset.setDate(leadDaysOffset.getDate() + 7);

        const servicesDue = await Service.find({
            status: ServiceStatus.ACTIVE,
            autoRenew: true,
            billingCycle: { $ne: BillingCycle.ONE_TIME },
            nextDueDate: { $lte: leadDaysOffset },
        }).populate('clientId').lean().exec();

        // 2) Idempotency Layer using RenewalLedger natively: filter out safely
        const nonInvoicedServices = [];
        for (const svc of servicesDue) {
            const existingLedger = await RenewalLedger.findOne({
                serviceId: svc._id,
                dueDate: svc.nextDueDate
            }).exec();

            if (!existingLedger) {
                nonInvoicedServices.push(svc);
            }
        }

        if (nonInvoicedServices.length === 0) return { servicesFound: 0, invoicesCreated: 0, itemsCreated: 0, skippedAlreadyInvoiced: servicesDue.length };

        let invoicesCreated = 0;
        let itemsCreated = 0;

        // Group by Client
        const clientServiceMap = new Map<string, typeof nonInvoicedServices>();
        for (const svc of nonInvoicedServices) {
            const clientId = (svc.clientId as any)._id ? (svc.clientId as any)._id.toString() : svc.clientId.toString();
            if (!clientServiceMap.has(clientId)) clientServiceMap.set(clientId, []);
            clientServiceMap.get(clientId)!.push(svc);
        }

        for (const [clientId, services] of clientServiceMap.entries()) {
            const client = services[0].clientId as any; // Populated doc

            const invoiceItems = services.map(svc => {
                const itemType = svc.type === 'DOMAIN' ? InvoiceItemType.DOMAIN : InvoiceItemType.HOSTING;
                itemsCreated++;
                return {
                    type: itemType,
                    description: `${svc.type} Renewal - ${(svc as any).productName || svc._id} (${svc.billingCycle})`,
                    amount: svc.priceSnapshot.recurring,
                    meta: {
                        serviceId: svc._id,
                        orderItemId: svc.orderItemId
                    }
                };
            });

            const subTotal = invoiceItems.reduce((acc, item) => acc + item.amount, 0);

            const invSeq = await getNextSequence('invoice');
            const invoiceNumber = formatSequenceId('INV', invSeq);
            const dueDate = services[0].nextDueDate; // Best effort alignment

            const invoice = new Invoice({
                clientId,
                invoiceNumber,
                status: InvoiceStatus.UNPAID,
                dueDate,
                billedTo: {
                    customerName: `${client.firstName} ${client.lastName}` || `Client ${clientId}`,
                    address: client.address?.street || 'N/A',
                    country: client.address?.country || 'N/A'
                },
                items: invoiceItems,
                currency: services[0].currency || DEFAULT_CURRENCY,
                subTotal,
                total: subTotal,
                balanceDue: subTotal
            });

            await invoice.save();
            invoicesCreated++;

            // Idempotent sync tracker mapping
            const ledgerEntries = services.map(s => ({
                serviceId: s._id,
                dueDate: s.nextDueDate,
                invoiceId: invoice._id
            }));

            try {
                await RenewalLedger.insertMany(ledgerEntries, { ordered: false });
            } catch (err: any) {
                if (err.code !== 11000) console.error('Failed to write renewal ledgers:', err);
            }
        }

        console.log(`[Scheduler] Renewals Processed. Services Found: ${servicesDue.length} | Invoices: ${invoicesCreated} | Items: ${itemsCreated}`);
        return { servicesFound: servicesDue.length, invoicesCreated, itemsCreated, skippedAlreadyInvoiced: servicesDue.length - nonInvoicedServices.length };
    }

    /**
     * Grace period evaluations suspending Unpaid overdue Active services explicitly linked securely.
     */
    async processOverdueEnforcements() {
        const graceDaysLimit = new Date();
        graceDaysLimit.setDate(graceDaysLimit.getDate() - 5); // 5 Days strictly Grace

        // 1. Find purely unpaid invoices older than the 5 day grace limit natively hitting relational Webhooks
        const overdueInvoices = await Invoice.find({
            status: InvoiceStatus.UNPAID,
            dueDate: { $lte: graceDaysLimit }
        }).lean().exec();

        let suspendedCount = 0;

        for (const invoice of overdueInvoices) {
            // 2. Identify precisely linked Services mapped in Items
            const serviceIdsToSuspend: mongoose.Types.ObjectId[] = [];

            for (const item of invoice.items) {
                // Utilizing the meta.serviceId reference we securely map during creation
                if (item.meta && item.meta.serviceId) {
                    serviceIdsToSuspend.push(item.meta.serviceId);
                }
            }

            if (serviceIdsToSuspend.length > 0) {
                // Determine which specific services will be securely suspended for audit
                const servicesToSuspendNow = await Service.find({
                    _id: { $in: serviceIdsToSuspend },
                    status: ServiceStatus.ACTIVE
                }).exec();

                // 3. Update active Services gracefully logging why
                const suspendedCountThisBatch = await Service.updateMany(
                    {
                        _id: { $in: serviceIdsToSuspend },
                        status: ServiceStatus.ACTIVE
                    },
                    {
                        $set: {
                            status: ServiceStatus.SUSPENDED,
                            suspendedAt: new Date(),
                            'meta.suspendReason': `Overdue unpaid invoice: ${invoice.invoiceNumber}`
                        }
                    }
                );
                suspendedCount += suspendedCountThisBatch.modifiedCount;

                // Create Native Audit Logs
                const auditLogs = servicesToSuspendNow.map(svc => ({
                    clientId: svc.clientId,
                    serviceId: svc._id,
                    action: 'SUSPEND',
                    beforeSnapshot: { status: ServiceStatus.ACTIVE },
                    afterSnapshot: { status: ServiceStatus.SUSPENDED, suspendedAt: new Date(), reason: `Overdue unpaid invoice: ${invoice.invoiceNumber}` }
                }));

                try {
                    await ServiceAuditLog.insertMany(auditLogs, { ordered: false });
                } catch (e) {
                    console.error('Failed creating ServiceAuditLogs', e);
                }

                // 4. Create ServiceActionJob for each suspended service
                const jobsToCreate = serviceIdsToSuspend.map(serviceId => ({
                    serviceId,
                    invoiceId: invoice._id,
                    action: ServiceActionType.SUSPEND,
                    status: ProvisioningJobStatus.QUEUED,
                }));

                // Use unordered insert to ignore duplicates if they already exist
                try {
                    await ServiceActionJob.insertMany(jobsToCreate, { ordered: false });
                } catch (e: any) {
                    // Ignore duplicate key errors for unique index
                    if (e.code !== 11000) {
                        console.error('Error creating ServiceActionJobs for suspension', e);
                    }
                }
            }
        }

        console.log(`[Scheduler] Overdue Enforcement Executed. Suspended ${suspendedCount} active services safely.`);
        return suspendedCount;
    }
}

export default new ServiceRenewalScheduler();

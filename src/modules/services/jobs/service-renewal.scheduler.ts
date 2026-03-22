import mongoose from 'mongoose';
import Service from '../service.model';
import Invoice from '../../invoice/invoice.model';
import Client from '../../client/client.model';
import ServiceActionJob from '../models/service-action-job.model';
import RenewalLedger from '../models/renewal-ledger.model';
import ServiceAuditLog from '../models/service-audit-log.model';
import { BillingCycle, ServiceStatus, ServiceActionType, ProvisioningJobStatus } from '../types/enums';
import { InvoiceStatus, InvoiceItemType } from '../../invoice/invoice.interface';
import { getNextSequence, formatSequenceId } from '../../../models/counter.model';
import { DEFAULT_CURRENCY } from '../../../config/currency.config';
import { getBillingSettings } from '../../billing-settings/billing-settings.service';
import config from '../../../config';
import * as emailService from '../../email/email.service';
import { getInvoicePdfBuffer } from '../../invoice/pdf/invoice-pdf.service';
import logger from '../../../utils/logger';

export class ServiceRenewalScheduler {
    /**
     * Finds active services due for renewal and creates invoices idempotently.
     */
    async processRenewals() {
        const settings = await getBillingSettings();
        const leadDays = settings.renewalLeadDays ?? 7;
        const leadDaysOffset = new Date();
        leadDaysOffset.setDate(leadDaysOffset.getDate() + leadDays);

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
            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
            auditLogSafe({
                message: `Auto-generated renewal invoice ${invoice.invoiceNumber} for client ${clientId}`,
                type: 'invoice_auto_generated',
                category: 'invoice',
                actorType: 'system',
                source: 'cron',
                clientId,
                invoiceId: invoice._id.toString(),
                meta: { serviceCount: services.length },
            });

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

            // Send renewal invoice email to client
            try {
                const clientDoc = await Client.findById(clientId).select('contactEmail firstName lastName').lean();
                const clientEmail = (clientDoc as any)?.contactEmail || '';
                if (clientEmail) {
                    const customerName = clientDoc
                        ? `${(clientDoc as any).firstName || ''} ${(clientDoc as any).lastName || ''}`.trim() || 'Customer'
                        : 'Customer';
                    const baseUrl = config.frontendUrl;
                    const lineItems = invoiceItems.map((i: any) => ({ label: i.description || 'Item', amount: String(i.amount ?? 0) }));
                    let attachments: { filename: string; content: Buffer }[] | undefined;
                    try {
                        const invDoc = await Invoice.findById(invoice._id).lean();
                        if (invDoc) {
                            const pdfBuffer = await getInvoicePdfBuffer(invDoc as any);
                            attachments = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }];
                        }
                    } catch (pdfErr: any) {
                        logger.warn('[Renewal] PDF generation failed, sending email without attachment:', pdfErr?.message);
                    }
                    await emailService.sendTemplatedEmail({
                        to: clientEmail,
                        templateKey: 'billing.invoice_created',
                        props: {
                            customerName,
                            invoiceNumber: invoice.invoiceNumber,
                            dueDate: dueDate ? new Date(dueDate).toLocaleDateString() : 'N/A',
                            amountDue: String(subTotal),
                            currency: services[0].currency || DEFAULT_CURRENCY,
                            invoiceUrl: `${baseUrl}/invoices/${invoice._id}`,
                            billingUrl: `${baseUrl}/client`,
                            lineItems,
                        },
                        attachments,
                    });
                }
            } catch (emailErr: any) {
                logger.warn('[Renewal] Invoice created email failed:', emailErr?.message || emailErr);
            }
        }

        console.log(`[Scheduler] Renewals Processed. Services Found: ${servicesDue.length} | Invoices: ${invoicesCreated} | Items: ${itemsCreated}`);
        return { servicesFound: servicesDue.length, invoicesCreated, itemsCreated, skippedAlreadyInvoiced: servicesDue.length - nonInvoicedServices.length };
    }

    /**
     * Grace period evaluations suspending Unpaid overdue Active services explicitly linked securely.
     */
    async processOverdueEnforcements() {
        const settings = await getBillingSettings();
        const graceDays = settings.daysBeforeSuspend ?? 5;
        const graceDaysLimit = new Date();
        graceDaysLimit.setDate(graceDaysLimit.getDate() - graceDays);

        // 1. Find unpaid invoices older than the grace period (admin-configurable)
        const overdueInvoices = await Invoice.find({
            status: { $in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
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

        // 5. Explicit admin-configured auto-suspend dates
        const now = new Date();
        const explicitlyScheduled = await Service.find({
            status: ServiceStatus.ACTIVE,
            'meta.autoSuspendAt': { $exists: true, $ne: null, $lte: now.toISOString() }
        }).exec();

        for (const svc of explicitlyScheduled) {
            const beforeStatus = svc.status;
            svc.status = ServiceStatus.SUSPENDED;
            svc.suspendedAt = new Date();
            svc.meta = svc.meta || {};
            svc.meta.suspendReason = 'Scheduled admin automation date reached';
            await svc.save();

            await ServiceAuditLog.create({
                clientId: svc.clientId,
                serviceId: svc._id,
                action: 'SUSPEND',
                beforeSnapshot: { status: beforeStatus, autoSuspendAt: svc.meta?.autoSuspendAt },
                afterSnapshot: { status: svc.status, suspendedAt: svc.suspendedAt, reason: svc.meta?.suspendReason }
            });

            try {
                await ServiceActionJob.create({
                    serviceId: svc._id,
                    action: ServiceActionType.SUSPEND,
                    status: ProvisioningJobStatus.QUEUED,
                });
            } catch (err: any) {
                if (err.code !== 11000) {
                    console.error('Failed to create scheduled SUSPEND service action job: ', err);
                }
            }
            suspendedCount++;
        }

        return suspendedCount;
    }
}

export default new ServiceRenewalScheduler();

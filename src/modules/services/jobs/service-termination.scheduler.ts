import Service from '../service.model';
import Client from '../../client/client.model';
import Invoice from '../../invoice/invoice.model';
import ServiceActionJob from '../models/service-action-job.model';
import ServiceAuditLog from '../models/service-audit-log.model';
import TerminationWarningLog from '../models/termination-warning-log.model';
import { ServiceStatus, ServiceActionType, ProvisioningJobStatus } from '../types/enums';
import { getBillingSettings } from '../../billing-settings/billing-settings.service';
import config from '../../../config';
import * as emailService from '../../email/email.service';
import logger from '../../../utils/logger';
import { auditLogSafe } from '../../activity-log/activity-log.service';

const SERVICE_TYPE_LABELS: Record<string, string> = {
    HOSTING: 'Hosting Service',
    VPS: 'VPS',
    EMAIL: 'Email Service',
    LICENSE: 'License',
    DOMAIN: 'Domain',
};

export class ServiceTerminationScheduler {
    /**
     * Send termination warning emails for suspended services X days before termination.
     */
    async processTerminationWarnings(): Promise<{ warningsSent: number }> {
        const settings = await getBillingSettings();
        const daysBeforeTermination = settings.daysBeforeTermination ?? 30;
        const warningDays = settings.terminationWarningDays ?? [7, 3, 1];
        const daysToCheck = warningDays.filter((d) => d > 0 && d < daysBeforeTermination);
        if (daysToCheck.length === 0) return { warningsSent: 0 };

        const now = new Date();
        const baseUrl = config.frontendUrl.replace(/\/$/, '');

        const suspendedServices = await Service.find({
            status: ServiceStatus.SUSPENDED,
            suspendedAt: { $exists: true, $ne: null },
        })
            .populate({ path: 'clientId', select: 'contactEmail firstName lastName user', populate: { path: 'user', select: 'email' } })
            .lean()
            .exec();

        let warningsSent = 0;

        for (const svc of suspendedServices) {
            const suspendedAt = svc.suspendedAt ? new Date(svc.suspendedAt) : null;
            if (!suspendedAt) continue;

            const terminationDate = new Date(suspendedAt);
            terminationDate.setDate(terminationDate.getDate() + daysBeforeTermination);

            const msRemaining = terminationDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

            if (!daysToCheck.includes(daysRemaining)) continue;

            const reminderType = `TERMINATION_WARN_${daysRemaining}`;
            const existing = await TerminationWarningLog.findOne({ serviceId: svc._id, reminderType });
            if (existing) continue;

            const client = svc.clientId as any;
            const clientEmail = client?.contactEmail || client?.user?.email;
            if (!clientEmail) {
                logger.warn(`[Termination] No email for service ${svc._id}, skipping warning`);
                continue;
            }

            const customerName = client?.firstName || client?.lastName
                ? `${client?.firstName || ''} ${client?.lastName || ''}`.trim()
                : 'Customer';
            const serviceName = SERVICE_TYPE_LABELS[(svc as any).type] || 'Service';
            const serviceIdentifier = (svc as any).serviceNumber || svc._id?.toString() || 'N/A';
            const terminationReason = (svc as any).meta?.suspendReason || 'Unpaid invoice';

            // Find linked invoice for restore URL
            const invoice = await Invoice.findOne({
                'items.meta.serviceId': svc._id,
                status: { $in: ['UNPAID', 'OVERDUE'] },
            }).lean();
            const restoreActionUrl = invoice
                ? `${baseUrl}/invoices/${invoice._id}/pay`
                : `${baseUrl}/client`;
            const supportUrl = `${baseUrl}/support`;

            try {
                await emailService.sendTemplatedEmail({
                    to: clientEmail,
                    templateKey: 'service.termination_warning',
                    props: {
                        customerName,
                        serviceName,
                        serviceIdentifier,
                        terminationReason,
                        daysRemaining,
                        terminationDate: terminationDate.toLocaleDateString(),
                        restoreActionUrl,
                        supportUrl,
                    },
                });

                await TerminationWarningLog.create({ serviceId: svc._id, reminderType });
                warningsSent++;
                auditLogSafe({
                    message: `Termination warning sent to ${customerName} for ${serviceName} (${daysRemaining} days)`,
                    type: 'email_sent',
                    category: 'email',
                    actorType: 'system',
                    source: 'cron',
                    clientId: (client._id ?? client)?.toString?.(),
                    meta: { reminderType, serviceId: svc._id?.toString?.() },
                });
            } catch (err: any) {
                logger.warn(`[Termination] Warning email failed for service ${svc._id}:`, err?.message);
            }
        }

        if (warningsSent > 0) {
            console.log(`[Scheduler] Termination warnings sent: ${warningsSent}`);
        }
        return { warningsSent };
    }

    /**
     * Job targeting Suspended services enforcing deep automated Termination rules.
     */
    async processTerminations() {
        const settings = await getBillingSettings();
        const daysBeforeTermination = settings.daysBeforeTermination ?? 30;
        const terminationLimit = new Date();
        terminationLimit.setDate(terminationLimit.getDate() - daysBeforeTermination);

        const servicesToTerminate = await Service.find({
            status: ServiceStatus.SUSPENDED,
            suspendedAt: { $lte: terminationLimit }
        }).exec();

        const nowIso = new Date().toISOString();
        const scheduledTerminations = await Service.find({
            status: { $in: [ServiceStatus.ACTIVE, ServiceStatus.SUSPENDED, ServiceStatus.PROVISIONING] },
            'meta.autoTerminateAt': { $exists: true, $ne: null, $lte: nowIso }
        }).exec();

        const merged = [...servicesToTerminate];
        for (const svc of scheduledTerminations) {
            if (!merged.some((m) => m._id.toString() === svc._id.toString())) {
                merged.push(svc);
            }
        }

        let terminatedCount = 0;

        for (const svc of merged) {
            const beforeStatus = svc.status;
            svc.status = ServiceStatus.TERMINATED;
            svc.terminatedAt = new Date();
            await svc.save();

            // 1. Audit Logging Native Protection
            await ServiceAuditLog.create({
                clientId: svc.clientId,
                serviceId: svc._id,
                action: 'TERMINATE',
                beforeSnapshot: { status: beforeStatus, suspendedAt: svc.suspendedAt, autoTerminateAt: (svc.meta as any)?.autoTerminateAt },
                afterSnapshot: { status: ServiceStatus.TERMINATED, terminatedAt: svc.terminatedAt },
            });

            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
            const eventType = (svc as any).type === 'HOSTING' ? 'hosting_terminated' : (svc as any).type === 'VPS' ? 'vps_terminated' : 'service_terminated';
            auditLogSafe({
                message: `Service ${svc._id} terminated by cron`,
                type: eventType as any,
                category: 'service',
                actorType: 'system',
                source: 'cron',
                clientId: (svc.clientId as any)?.toString(),
                serviceId: svc._id.toString(),
            });

            // 2. Queue Downstream Provider Termination execution natively!
            try {
                await ServiceActionJob.create({
                    serviceId: svc._id,
                    action: ServiceActionType.TERMINATE,
                    status: ProvisioningJobStatus.QUEUED,
                });
            } catch (err: any) {
                if (err.code !== 11000) {
                    console.error('Failed to create TERMINATE service action job: ', err);
                }
            }

            // Send service terminated email
            this.sendTerminatedEmail(svc).catch((err: any) =>
                logger.warn('[Termination] Failed to send terminated email:', err?.message)
            );

            terminatedCount++;
        }

        console.log(`[Scheduler] Termination enforcement sweep completed. Terminated ${terminatedCount} dead services safely.`);
        return terminatedCount;
    }

    private async sendTerminatedEmail(svc: any): Promise<void> {
        const client = await Client.findById(svc.clientId).select('contactEmail firstName lastName').lean();
        if (!client) return;
        const clientEmail = (client as any).contactEmail;
        if (!clientEmail) return;

        const customerName = [((client as any).firstName || '').trim(), ((client as any).lastName || '').trim()]
            .filter(Boolean).join(' ') || 'Customer';

        const serviceName = SERVICE_TYPE_LABELS[svc.type] || 'Service';
        const serviceIdentifier = svc.serviceNumber || svc._id?.toString() || 'N/A';
        const terminationReason = (svc.meta as any)?.suspendReason || 'Prolonged non-payment';

        const baseUrl = config.frontendUrl.replace(/\/$/, '');
        const restoreInfoUrl = `${baseUrl}/client`;
        const supportUrl = `${baseUrl}/support`;

        await emailService.sendTemplatedEmail({
            to: clientEmail,
            templateKey: 'service.terminated',
            props: {
                customerName,
                serviceName,
                serviceIdentifier,
                terminationReason,
                restoreInfoUrl,
                supportUrl,
            },
        });
    }
}

export default new ServiceTerminationScheduler();

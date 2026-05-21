import Invoice from '../../invoice/invoice.model';
import { InvoiceStatus } from '../../invoice/invoice.interface';
import Service from '../service.model';
import ServiceActionJob from '../models/service-action-job.model';
import { ProvisioningJobStatus, ServiceActionType, ServiceStatus, ServiceType } from '../types/enums';
import { auditLogSafe } from '../../activity-log/activity-log.service';

class TrialLifecycleScheduler {
    async processExpiredTrials(): Promise<{ suspended: number; skippedPaid: number; failed: number }> {
        const now = new Date();
        const services = await Service.find({
            type: ServiceType.HOSTING,
            status: ServiceStatus.ACTIVE,
            'meta.trialProvisioned': true,
            'meta.provisionedWithoutPayment': true,
            'meta.trialSuspendedAt': { $exists: false },
            'meta.trialEndsAt': { $lte: now.toISOString() },
        }).limit(100).exec();

        let suspended = 0;
        let skippedPaid = 0;
        let failed = 0;

        for (const svc of services) {
            try {
                const invoice = svc.invoiceId
                    ? await Invoice.findById(svc.invoiceId).select('status balanceDue invoiceNumber').lean()
                    : null;
                if (invoice && invoice.status === InvoiceStatus.PAID && (invoice.balanceDue ?? 0) <= 0) {
                    skippedPaid++;
                    continue;
                }

                svc.status = ServiceStatus.SUSPENDED;
                svc.suspendedAt = now;
                svc.meta = svc.meta || {};
                svc.meta.trialSuspendedAt = now.toISOString();
                svc.meta.suspendReason = 'Trial expired before payment';
                await svc.save();

                try {
                    await ServiceActionJob.create({
                        serviceId: svc._id,
                        invoiceId: svc.invoiceId,
                        action: ServiceActionType.SUSPEND,
                        status: ProvisioningJobStatus.QUEUED,
                    });
                } catch (err: any) {
                    if (err.code !== 11000) throw err;
                }

                auditLogSafe({
                    message: `Trial hosting service ${svc._id} suspended after trial expiry`,
                    type: 'service_suspended',
                    category: 'service',
                    actorType: 'system',
                    source: 'cron',
                    clientId: (svc.clientId as any)?.toString(),
                    serviceId: svc._id.toString(),
                    invoiceId: (svc.invoiceId as any)?.toString?.(),
                });
                suspended++;
            } catch {
                failed++;
            }
        }

        return { suspended, skippedPaid, failed };
    }
}

export default new TrialLifecycleScheduler();

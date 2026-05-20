import crypto from 'crypto';
import DomainRenewalJob from '../models/domain-renewal-job.model';
import DomainServiceDetails from '../models/domain-details.model';
import Service from '../service.model';
import Invoice from '../../invoice/invoice.model';
import { InvoiceStatus } from '../../invoice/invoice.interface';
import { domainRegistrarService } from '../../domain/registrar/domain-registrar.service';
import { ProvisioningJobStatus } from '../types/enums';
import { auditLogSafe } from '../../activity-log/activity-log.service';
import logger from '../../../utils/logger';

export class DomainRenewalWorker {
    async processQueuedJobs(): Promise<number> {
        const lockDurationMs = 5 * 60 * 1000;
        const lockOwner = crypto.randomBytes(16).toString('hex');
        const now = new Date();
        const staleLockThreshold = new Date(now.getTime() - lockDurationMs);

        const jobsToLock = await DomainRenewalJob.find({
            $or: [
                {
                    status: ProvisioningJobStatus.QUEUED,
                    $expr: { $lt: ['$attempts', '$maxAttempts'] },
                },
                {
                    status: ProvisioningJobStatus.RUNNING,
                    lockedAt: { $lt: staleLockThreshold },
                },
            ],
        })
            .sort({ createdAt: 1 })
            .limit(10)
            .lean()
            .exec();

        if (jobsToLock.length === 0) return 0;

        const jobIds = jobsToLock.map((job) => job._id);
        await DomainRenewalJob.updateMany(
            { _id: { $in: jobIds } },
            {
                $set: {
                    status: ProvisioningJobStatus.RUNNING,
                    lockedAt: now,
                    lockOwner,
                },
                $inc: { attempts: 1 },
            }
        ).exec();

        const lockedJobs = await DomainRenewalJob.find({ lockOwner, lockedAt: now }).exec();

        for (const job of lockedJobs) {
            try {
                await this.processSingleJob(job);
                job.status = ProvisioningJobStatus.SUCCESS;
                job.lockedAt = undefined;
                job.lockOwner = undefined;
                job.lastError = undefined;
                job.completedAt = new Date();
                await job.save();
            } catch (err: any) {
                job.lastError = err?.message || 'Unknown domain renewal error';
                job.status = job.attempts >= job.maxAttempts
                    ? ProvisioningJobStatus.FAILED
                    : ProvisioningJobStatus.QUEUED;
                job.lockedAt = undefined;
                job.lockOwner = undefined;
                await job.save();

                if (job.status === ProvisioningJobStatus.FAILED) {
                    await this.markServiceFailure(job, job.lastError || 'Unknown domain renewal error');
                }
            }
        }

        return lockedJobs.length;
    }

    private async processSingleJob(job: any): Promise<void> {
        const invoice = await Invoice.findById(job.invoiceId).select('status balanceDue invoiceNumber').lean();
        if (!invoice || invoice.status !== InvoiceStatus.PAID || (invoice.balanceDue ?? 0) > 0) {
            throw new Error(`Invoice ${job.invoiceId} is not fully paid`);
        }

        const details = await DomainServiceDetails.findById(job.domainDetailsId).exec();
        if (!details?.domainName) throw new Error('Domain details not found');

        const service = await Service.findById(job.serviceId).exec();
        if (!service) throw new Error('Domain service not found');

        if (details.expiresAt && new Date(details.expiresAt).getTime() >= new Date(job.renewedUntil).getTime()) {
            service.meta = service.meta || {};
            service.meta.domainRenewalStatus = 'already_current';
            service.meta.domainRenewalJobId = job._id.toString();
            service.meta.domainRenewalInvoiceId = job.invoiceId.toString();
            await service.save();
            return;
        }

        logger.info(`[DomainRenewal] Renewing ${job.domainName} for ${job.years} year(s) via ${job.registrar || 'default registrar'}`);
        const result = await domainRegistrarService.renewDomain(
            {
                domain: details.domainName,
                years: Number(job.years) || 1,
                currency: job.currency,
            },
            job.registrar || details.registrar
        );

        const expirationDate = result.expirationDate || job.renewedUntil;
        details.expiresAt = expirationDate;
        details.registrar = result.registrar || details.registrar;
        details.lastRegistrarSyncAt = new Date();
        details.syncStatus = 'success';
        details.syncMessage = `Renewed from paid invoice ${invoice.invoiceNumber}`;
        await details.save();

        service.provisioning = service.provisioning || {};
        service.provisioning.lastSyncedAt = new Date();
        service.provisioning.lastError = '';
        service.meta = service.meta || {};
        service.meta.domainRenewalStatus = 'success';
        service.meta.domainRenewalJobId = job._id.toString();
        service.meta.domainRenewalInvoiceId = job.invoiceId.toString();
        service.meta.domainRenewedFrom = new Date(job.renewedFrom).toISOString();
        service.meta.domainRenewedUntil = new Date(job.renewedUntil).toISOString();
        service.meta.domainRegistrarExpirationDate = new Date(expirationDate).toISOString();
        service.meta.domainRenewalOrderId = (result as any).orderId;
        await service.save();

        auditLogSafe({
            message: `Domain ${details.domainName} renewed after invoice ${invoice.invoiceNumber} was paid`,
            type: 'domain_renewed',
            category: 'domain',
            actorType: 'system',
            source: 'cron',
            clientId: (job.clientId as any)?.toString?.(),
            serviceId: job.serviceId.toString(),
            invoiceId: job.invoiceId.toString(),
            meta: {
                domain: details.domainName,
                years: job.years,
                registrar: details.registrar,
                expiresAt: expirationDate,
                jobId: job._id.toString(),
            },
        });
    }

    private async markServiceFailure(job: any, reason: string): Promise<void> {
        await Service.updateOne(
            { _id: job.serviceId },
            {
                $set: {
                    'provisioning.lastError': reason,
                    'meta.domainRenewalStatus': 'failed',
                    'meta.domainRenewalJobId': job._id.toString(),
                    'meta.domainRenewalInvoiceId': job.invoiceId.toString(),
                    'meta.domainRenewalError': reason,
                    'meta.domainRenewalFailedAt': new Date(),
                },
            }
        ).exec();

        auditLogSafe({
            message: `Domain renewal failed for ${job.domainName}: ${reason}`,
            type: 'domain_renewed',
            category: 'domain',
            actorType: 'system',
            source: 'cron',
            status: 'failure',
            severity: 'high',
            clientId: (job.clientId as any)?.toString?.(),
            serviceId: job.serviceId.toString(),
            invoiceId: job.invoiceId.toString(),
            meta: { domain: job.domainName, jobId: job._id.toString() },
        });
    }
}

export default new DomainRenewalWorker();

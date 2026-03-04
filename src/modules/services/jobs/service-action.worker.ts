import ServiceActionJob from '../models/service-action-job.model';
import Service from '../service.model';
import { ProvisioningJobStatus, ServiceActionType, ServiceType } from '../types/enums';
import {
    hostingPanelProvider,
    vpsProvider,
    emailProvider,
    licenseProvider
} from '../providers/stubs';
import crypto from 'crypto';

export class ServiceActionWorker {
    async processQueuedJobs() {
        const lockDurationMs = 5 * 60 * 1000;
        const lockOwner = crypto.randomBytes(16).toString('hex');
        const now = new Date();
        const staleLockThreshold = new Date(now.getTime() - lockDurationMs);

        // Find QUEUED jobs or stale RUNNING ones
        const jobsToLock = await ServiceActionJob.find({
            $or: [
                {
                    status: ProvisioningJobStatus.QUEUED,
                    $expr: { $lt: ['$attempts', '$maxAttempts'] }
                },
                {
                    status: ProvisioningJobStatus.RUNNING,
                    lockedAt: { $lt: staleLockThreshold }
                }
            ]
        })
            .sort({ createdAt: 1 })
            .limit(10)
            .lean()
            .exec();

        if (jobsToLock.length === 0) return 0;

        const jobIds = jobsToLock.map(j => j._id);

        await ServiceActionJob.updateMany(
            { _id: { $in: jobIds } },
            {
                $set: {
                    status: ProvisioningJobStatus.RUNNING,
                    lockedAt: now,
                    lockOwner
                },
                $inc: { attempts: 1 }
            }
        ).exec();

        const lockedJobs = await ServiceActionJob.find({ lockOwner, lockedAt: now }).exec();

        for (const job of lockedJobs) {
            try {
                await this.processSingleActionJob(job);

                job.status = ProvisioningJobStatus.SUCCESS;
                job.lockedAt = undefined;
                job.lockOwner = undefined;
                await job.save();

            } catch (err: any) {
                job.lastError = err.message || 'Unknown error executing action';
                if (job.attempts >= job.maxAttempts) {
                    job.status = ProvisioningJobStatus.FAILED;
                } else {
                    job.status = ProvisioningJobStatus.QUEUED;
                }
                job.lockedAt = undefined;
                job.lockOwner = undefined;
                await job.save();
            }
        }

        return lockedJobs.length;
    }

    private async processSingleActionJob(job: any) {
        const service = await Service.findById(job.serviceId);
        if (!service) {
            // Service might have been explicitly deleted, abort gracefully.
            return;
        }

        const remoteId = service.provisioning?.remoteId;

        // Note: For domains we avoid explicitly suspending the registry if not needed, or lock management only.
        if (!remoteId && service.type !== ServiceType.DOMAIN) {
            throw new Error('Service missing remoteId to execute action');
        }

        switch (service.type) {
            case ServiceType.HOSTING:
                if (job.action === ServiceActionType.SUSPEND) await hostingPanelProvider.suspendAccount(remoteId as string, 'Automated Suspension');
                if (job.action === ServiceActionType.UNSUSPEND) await hostingPanelProvider.unsuspendAccount(remoteId as string);
                if (job.action === ServiceActionType.TERMINATE) await hostingPanelProvider.terminateAccount(remoteId as string);
                break;
            case ServiceType.VPS:
                if (job.action === ServiceActionType.SUSPEND) await vpsProvider.powerOff(remoteId as string);
                if (job.action === ServiceActionType.UNSUSPEND) await vpsProvider.start(remoteId as string);
                if (job.action === ServiceActionType.TERMINATE) await vpsProvider.destroy(remoteId as string);
                break;
            case ServiceType.EMAIL:
                if (job.action === ServiceActionType.SUSPEND) await emailProvider.suspendPlan(remoteId as string);
                if (job.action === ServiceActionType.UNSUSPEND) await emailProvider.restorePlan(remoteId as string);
                if (job.action === ServiceActionType.TERMINATE) await emailProvider.cancelPlan(remoteId as string);
                break;
            case ServiceType.LICENSE:
                if (job.action === ServiceActionType.SUSPEND) await licenseProvider.disableLicense(remoteId as string);
                if (job.action === ServiceActionType.UNSUSPEND) await licenseProvider.enableLicense(remoteId as string);
                if (job.action === ServiceActionType.TERMINATE) {
                    // Typical terminology varies, we disable for termination in stub contexts.
                    await licenseProvider.disableLicense(remoteId as string);
                }
                break;
            case ServiceType.DOMAIN:
                // Typically Lock DNS / Extensible Provider Action.
                // We'll mock silent success for domains
                break;
            default:
                throw new Error('Unsupported ServiceType mapped in ActionWorker');
        }
    }
}

export default new ServiceActionWorker();

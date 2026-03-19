import ServiceActionJob from '../models/service-action-job.model';
import Service from '../service.model';
import Client from '../../client/client.model';
import { ProvisioningJobStatus, ServiceActionType, ServiceType } from '../types/enums';
import {
    hostingPanelProvider,
    vpsProvider,
    emailProvider,
    licenseProvider
} from '../providers/stubs';
import { hostingDetailsRepository } from '../repositories';
import { serverService } from '../../server/server.service';
import * as emailService from '../../email/email.service';
import config from '../../../config';
import logger from '../../../utils/logger';
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

        // HOSTING uses hosting details (serverId, accountUsername); DOMAIN has no remote action.
        if (!remoteId && service.type !== ServiceType.DOMAIN && service.type !== ServiceType.HOSTING) {
            throw new Error('Service missing remoteId to execute action');
        }

        switch (service.type) {
            case ServiceType.HOSTING:
                await this.executeHostingAction(job, service);
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

        // Send service.suspended email after successful SUSPEND action
        if (job.action === ServiceActionType.SUSPEND) {
            this.sendSuspendedEmail(service, job).catch((err) =>
                logger.warn('[ServiceAction] Failed to send suspended email:', err?.message)
            );
        }
    }

    /**
     * Execute suspend/unsuspend/terminate for HOSTING via real WHM API.
     * Uses hosting details (serverId, accountUsername) to call the correct server.
     */
    private async executeHostingAction(job: any, service: any): Promise<void> {
        const details = await hostingDetailsRepository.findByServiceId(service._id.toString());
        if (!details?.serverId || !details?.accountUsername) {
            logger.warn(`[ServiceAction] Hosting service ${service._id} has no serverId or accountUsername, falling back to stub`);
            const remoteId = service.provisioning?.remoteId || details?.accountUsername;
            if (remoteId) {
                if (job.action === ServiceActionType.SUSPEND) await hostingPanelProvider.suspendAccount(remoteId, 'Automated Suspension');
                if (job.action === ServiceActionType.UNSUSPEND) await hostingPanelProvider.unsuspendAccount(remoteId);
                if (job.action === ServiceActionType.TERMINATE) await hostingPanelProvider.terminateAccount(remoteId);
            }
            return;
        }

        const client = await serverService.getWhmClient(details.serverId.toString());
        if (!client) {
            throw new Error(`WHM client unavailable for server ${details.serverId}. Configure API token in Admin → Servers.`);
        }

        const username = details.accountUsername;
        if (job.action === ServiceActionType.SUSPEND) {
            await client.suspendAccount(username, 'Automated Suspension');
            logger.info(`[ServiceAction] WHM suspended account ${username} for service ${service._id}`);
        } else if (job.action === ServiceActionType.UNSUSPEND) {
            await client.unsuspendAccount(username);
            logger.info(`[ServiceAction] WHM unsuspended account ${username} for service ${service._id}`);
            const { auditLogSafe } = await import('../../activity-log/activity-log.service');
            auditLogSafe({
                message: `cPanel account ${username} auto-unsuspended via WHM after invoice paid`,
                type: 'service_unsuspended',
                category: 'service',
                actorType: 'system',
                source: 'cron',
                clientId: (service.clientId as any)?.toString?.(),
                serviceId: service._id.toString(),
                meta: { action: 'UNSUSPEND', accountUsername: username, invoiceId: job.invoiceId?.toString?.() },
            });
        } else if (job.action === ServiceActionType.TERMINATE) {
            await client.terminateAccount(username);
            logger.info(`[ServiceAction] WHM terminated account ${username} for service ${service._id}`);
        }
    }

    private async sendSuspendedEmail(service: any, job: any): Promise<void> {
        const client = await Client.findById(service.clientId).select('contactEmail firstName lastName').lean();
        if (!client) return;
        const clientEmail = (client as any).contactEmail;
        if (!clientEmail) return;

        const customerName = [((client as any).firstName || '').trim(), ((client as any).lastName || '').trim()]
            .filter(Boolean).join(' ') || 'Customer';

        const serviceTypeLabels: Record<string, string> = {
            [ServiceType.HOSTING]: 'Hosting Service',
            [ServiceType.VPS]: 'VPS',
            [ServiceType.EMAIL]: 'Email Service',
            [ServiceType.LICENSE]: 'License',
            [ServiceType.DOMAIN]: 'Domain',
        };
        const serviceName = serviceTypeLabels[service.type] || 'Service';
        const serviceIdentifier = service.serviceNumber || service._id?.toString() || 'N/A';
        const suspensionReason = (service.meta as any)?.suspendReason || 'Unpaid invoice';

        const baseUrl = config.frontendUrl.replace(/\/$/, '');
        const restoreActionUrl = job.invoiceId
            ? `${baseUrl}/invoices/${job.invoiceId}/pay`
            : `${baseUrl}/client`;
        const supportUrl = `${baseUrl}/support`;

        await emailService.sendTemplatedEmail({
            to: clientEmail,
            templateKey: 'service.suspended',
            props: {
                customerName,
                serviceName,
                serviceIdentifier,
                suspensionReason,
                restoreActionUrl,
                supportUrl,
            },
        });
    }
}

export default new ServiceActionWorker();

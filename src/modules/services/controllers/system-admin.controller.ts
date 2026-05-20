import { Request, Response } from 'express';
import ProvisioningJob from '../models/provisioning-job.model';
import ServiceActionJob from '../models/service-action-job.model';
import DomainRenewalJob from '../models/domain-renewal-job.model';
import DomainServiceDetails from '../models/domain-details.model';
import Service from '../service.model';
import provisioningWorker from '../jobs/provisioning.worker';
import serviceActionWorker from '../jobs/service-action.worker';
import domainRenewalWorker from '../jobs/domain-renewal.worker';
import { domainRegistrarService } from '../../domain/registrar/domain-registrar.service';
import { auditLogSafe } from '../../activity-log/activity-log.service';
import { automationTasksService } from '../jobs/automation-tasks.service';
import {
    AutomationTaskKey,
    getAutomationTaskRegistryItem,
} from '../jobs/automation-task.registry';
import { automationRunService } from '../core/automation-run.service';

export const systemAdminController = {
    // ---- Jobs Management ----

    async getProvisioningJobs(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const status = req.query.status as string;
            const serviceId = req.query.serviceId as string;
            const domainName = req.query.domainName as string;

            const filter: any = {};
            if (status) filter.status = status;
            if (serviceId) filter.serviceId = serviceId;
            if (domainName) filter.domainName = String(domainName).trim().toLowerCase();

            const jobs = await ProvisioningJob.find(filter)
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            return res.status(200).json({ success: true, count: jobs.length, data: jobs });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async retryProvisioningJob(req: Request, res: Response) {
        try {
            const { jobId } = req.params;
            const job = await ProvisioningJob.findById(jobId);
            if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

            job.status = 'QUEUED' as any;
            job.attempts = 0;
            job.lastError = undefined;
            job.lockedAt = undefined;
            job.lockOwner = undefined;
            await job.save();

            // Fire worker manually
            provisioningWorker.processQueuedJobs().catch(console.error);

            return res.status(200).json({ success: true, message: 'Job queued for retry asynchronously', data: job });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async getServiceActionJobs(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const status = req.query.status as string;

            const filter: any = {};
            if (status) filter.status = status;

            const jobs = await ServiceActionJob.find(filter)
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            return res.status(200).json({ success: true, count: jobs.length, data: jobs });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async retryServiceActionJob(req: Request, res: Response) {
        try {
            const { jobId } = req.params;
            const job = await ServiceActionJob.findById(jobId);
            if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

            job.status = 'QUEUED' as any;
            job.attempts = 0;
            job.lastError = undefined;
            job.lockedAt = undefined;
            job.lockOwner = undefined;
            await job.save();

            // Fire worker manually
            serviceActionWorker.processQueuedJobs().catch(console.error);

            return res.status(200).json({ success: true, message: 'Service Action Job queued for retry asynchronously', data: job });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async getDomainRenewalJobs(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const status = req.query.status as string;

            const filter: any = {};
            if (status) filter.status = status;

            const jobs = await DomainRenewalJob.find(filter)
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            return res.status(200).json({ success: true, count: jobs.length, data: jobs });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async retryDomainRenewalJob(req: Request, res: Response) {
        try {
            const { jobId } = req.params;
            const job = await DomainRenewalJob.findById(jobId);
            if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

            job.status = 'QUEUED' as any;
            job.attempts = 0;
            job.lastError = undefined;
            job.lockedAt = undefined;
            job.lockOwner = undefined;
            await job.save();

            domainRenewalWorker.processQueuedJobs().catch(console.error);

            return res.status(200).json({ success: true, message: 'Domain renewal job queued for retry asynchronously', data: job });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async markDomainRenewalManuallyRenewed(req: Request, res: Response) {
        try {
            const { jobId } = req.params;
            const { expiresAt, note, registrarTransactionId } = req.body || {};
            if (!expiresAt) return res.status(400).json({ success: false, message: 'expiresAt is required' });

            const parsedExpiresAt = new Date(expiresAt);
            if (Number.isNaN(parsedExpiresAt.getTime())) {
                return res.status(400).json({ success: false, message: 'Invalid expiresAt date' });
            }

            const job = await DomainRenewalJob.findById(jobId);
            if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

            await DomainServiceDetails.updateOne(
                { _id: job.domainDetailsId },
                {
                    $set: {
                        expiresAt: parsedExpiresAt,
                        lastRegistrarSyncAt: new Date(),
                        syncStatus: 'success',
                        syncMessage: 'Manually reconciled after registrar renewal',
                    },
                }
            ).exec();

            await Service.updateOne(
                { _id: job.serviceId },
                {
                    $set: {
                        'provisioning.lastSyncedAt': new Date(),
                        'provisioning.lastError': '',
                        'meta.domainRenewalStatus': 'manually_renewed',
                        'meta.domainRenewalJobId': job._id.toString(),
                        'meta.domainRenewalInvoiceId': job.invoiceId.toString(),
                        'meta.domainRegistrarExpirationDate': parsedExpiresAt.toISOString(),
                        'meta.domainRenewalManualAt': new Date(),
                        'meta.domainRenewalManualBy': (req as any).user?._id?.toString?.(),
                        'meta.domainRenewalManualNote': note || '',
                        'meta.domainRenewalRegistrarTransactionId': registrarTransactionId || '',
                    },
                }
            ).exec();

            job.status = 'SUCCESS' as any;
            job.completedAt = new Date();
            job.lastError = undefined;
            job.lockedAt = undefined;
            job.lockOwner = undefined;
            job.manualResolvedAt = new Date();
            job.manualResolvedBy = (req as any).user?._id;
            job.manualResolutionNote = note || '';
            job.registrarTransactionId = registrarTransactionId || '';
            job.resolutionSource = 'manual';
            await job.save();

            auditLogSafe({
                message: `Domain renewal manually reconciled for ${job.domainName}`,
                type: 'domain_renewed',
                category: 'domain',
                actorType: 'user',
                actorId: (req as any).user?._id?.toString?.(),
                source: 'manual',
                clientId: job.clientId.toString(),
                serviceId: job.serviceId.toString(),
                invoiceId: job.invoiceId.toString(),
                meta: {
                    domain: job.domainName,
                    expiresAt: parsedExpiresAt,
                    registrarTransactionId,
                    note,
                    jobId: job._id.toString(),
                },
            });

            return res.status(200).json({ success: true, message: 'Domain renewal marked as manually renewed', data: job });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async syncDomainRenewalJobFromRegistrar(req: Request, res: Response) {
        try {
            const { jobId } = req.params;
            const job = await DomainRenewalJob.findById(jobId);
            if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

            const details = await DomainServiceDetails.findById(job.domainDetailsId);
            if (!details?.domainName) return res.status(404).json({ success: false, message: 'Domain details not found' });

            const liveInfo = await domainRegistrarService.getDomainInformation(details.domainName, details.registrar);
            if (!liveInfo.expiryDate) {
                return res.status(400).json({ success: false, message: 'Registrar did not return an expiry date' });
            }

            details.expiresAt = liveInfo.expiryDate;
            details.registrar = liveInfo.registrar || details.registrar;
            details.registrarStatus = liveInfo.status;
            details.lastRegistrarSyncAt = new Date();
            details.syncStatus = 'success';
            details.syncMessage = 'Synced from registrar while reconciling renewal job';
            await details.save();

            if (new Date(liveInfo.expiryDate).getTime() >= new Date(job.renewedUntil).getTime()) {
                await Service.updateOne(
                    { _id: job.serviceId },
                    {
                        $set: {
                            'provisioning.lastSyncedAt': new Date(),
                            'provisioning.lastError': '',
                            'meta.domainRenewalStatus': 'registrar_synced',
                            'meta.domainRenewalJobId': job._id.toString(),
                            'meta.domainRenewalInvoiceId': job.invoiceId.toString(),
                            'meta.domainRegistrarExpirationDate': new Date(liveInfo.expiryDate).toISOString(),
                        },
                    }
                ).exec();

                job.status = 'SUCCESS' as any;
                job.completedAt = new Date();
                job.lastError = undefined;
                job.lockedAt = undefined;
                job.lockOwner = undefined;
                job.resolutionSource = 'registrar_sync';
                await job.save();
            }

            auditLogSafe({
                message: `Domain renewal job synced from registrar for ${job.domainName}`,
                type: 'domain_renewed',
                category: 'domain',
                actorType: 'user',
                actorId: (req as any).user?._id?.toString?.(),
                source: 'manual',
                clientId: job.clientId.toString(),
                serviceId: job.serviceId.toString(),
                invoiceId: job.invoiceId.toString(),
                meta: {
                    domain: job.domainName,
                    expiresAt: liveInfo.expiryDate,
                    jobId: job._id.toString(),
                    resolved: new Date(liveInfo.expiryDate).getTime() >= new Date(job.renewedUntil).getTime(),
                },
            });

            return res.status(200).json({ success: true, message: 'Domain renewal job synced from registrar', data: job });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    // ---- Cron Executions (Manual Overrides) ----

    async triggerRenewals(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runRenewals('manual');
            return res.status(200).json({ success: true, message: 'Renewal scheduler forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerOverdueSuspensions(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runOverdueSuspensions('manual');
            return res.status(200).json({ success: true, message: 'Overdue suspension forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerInvoiceReminders(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runInvoiceReminders('manual');
            return res.status(200).json({ success: true, message: 'Invoice reminder forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerTerminations(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runTerminations('manual');
            return res.status(200).json({ success: true, message: 'Service termination forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    /** Refresh resource usage (disk/bandwidth) from WHM for all hosting services. Call from cron every 15–30 min. */
    async triggerUsageSync(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runUsageSync('manual');
            return res.status(200).json({ success: true, message: 'Usage sync complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerProvisioningWorker(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runProvisioningWorker('manual');
            return res.status(200).json({ success: true, message: 'Provisioning Worker forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerActionWorker(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runActionWorker('manual');
            return res.status(200).json({ success: true, message: 'Service Action Worker forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerDomainSync(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runDomainSync('manual');
            return res.status(200).json({ success: true, message: 'Domain sync forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerDomainRenewals(_req: Request, res: Response) {
        try {
            const result = await automationTasksService.runDomainRenewals('manual');
            return res.status(200).json({ success: true, message: 'Domain renewal worker forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerAutomationTask(req: Request, res: Response) {
        try {
            const taskKey = req.params.taskKey as AutomationTaskKey;
            if (!getAutomationTaskRegistryItem(taskKey)) {
                return res.status(400).json({ success: false, message: 'Invalid automation task key' });
            }

            const result = await automationTasksService.runTaskByKey(taskKey, 'manual');
            return res.status(200).json({
                success: true,
                message: `Automation task ${taskKey} executed successfully`,
                data: result,
            });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async getAutomationRuns(req: Request, res: Response) {
        try {
            const page = parseInt(req.query.page as string, 10) || 1;
            const limit = parseInt(req.query.limit as string, 10) || 20;
            const taskKey = req.query.taskKey as string | undefined;
            const status = req.query.status as 'running' | 'success' | 'failure' | undefined;
            const source = req.query.source as 'cron' | 'manual' | undefined;

            const result = await automationRunService.listRuns({
                page,
                limit,
                taskKey,
                status,
                source,
            });

            return res.status(200).json({ success: true, data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async getAutomationSummary(_req: Request, res: Response) {
        try {
            const result = await automationRunService.getSummary();
            return res.status(200).json({ success: true, data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    }
};

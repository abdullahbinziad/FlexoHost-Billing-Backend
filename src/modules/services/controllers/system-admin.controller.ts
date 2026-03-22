import { Request, Response } from 'express';
import ProvisioningJob from '../models/provisioning-job.model';
import ServiceActionJob from '../models/service-action-job.model';
import provisioningWorker from '../jobs/provisioning.worker';
import serviceActionWorker from '../jobs/service-action.worker';
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

            const filter: any = {};
            if (status) filter.status = status;

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

import { Request, Response } from 'express';
import ProvisioningJob from '../models/provisioning-job.model';
import ServiceActionJob from '../models/service-action-job.model';
import provisioningWorker from '../jobs/provisioning.worker';
import serviceActionWorker from '../jobs/service-action.worker';
import serviceRenewalScheduler from '../jobs/service-renewal.scheduler';
import invoiceReminderScheduler from '../jobs/invoice-reminder.scheduler';
import serviceTerminationScheduler from '../jobs/service-termination.scheduler';

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
            const result = await serviceRenewalScheduler.processRenewals();
            return res.status(200).json({ success: true, message: 'Renewal scheduler forced execution complete', data: result });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerOverdueSuspensions(_req: Request, res: Response) {
        try {
            const suspendedCount = await serviceRenewalScheduler.processOverdueEnforcements();
            return res.status(200).json({ success: true, message: 'Overdue suspension forced execution complete', data: { suspendedCount } });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerInvoiceReminders(_req: Request, res: Response) {
        try {
            const results = await invoiceReminderScheduler.processReminders();
            return res.status(200).json({ success: true, message: 'Invoice reminder forced execution complete', data: results });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerTerminations(_req: Request, res: Response) {
        try {
            const terminatedCount = await serviceTerminationScheduler.processTerminations();
            return res.status(200).json({ success: true, message: 'Service termination forced execution complete', data: { terminatedCount } });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerProvisioningWorker(_req: Request, res: Response) {
        try {
            await provisioningWorker.processQueuedJobs();
            return res.status(200).json({ success: true, message: 'Provisioning Worker forced execution complete' });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    },

    async triggerActionWorker(_req: Request, res: Response) {
        try {
            await serviceActionWorker.processQueuedJobs();
            return res.status(200).json({ success: true, message: 'Service Action Worker forced execution complete' });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    }
};

import serviceRenewalScheduler from './service-renewal.scheduler';
import invoiceReminderScheduler from './invoice-reminder.scheduler';
import serviceTerminationScheduler from './service-termination.scheduler';
import usageSyncScheduler from './usage-sync.scheduler';
import provisioningWorker from './provisioning.worker';
import serviceActionWorker from './service-action.worker';
import domainSyncScheduler from './domain-sync.scheduler';
import domainExpiryReminderScheduler from './domain-expiry-reminder.scheduler';
import { billableItemService } from '../../billable-item/billable-item.service';
import {
    AutomationTaskKey,
    getAutomationTaskRegistryItem,
} from './automation-task.registry';
import { auditLogSafe } from '../../activity-log/activity-log.service';
import { automationAlertService } from '../core/automation-alert.service';
import { automationDigestService } from '../core/automation-digest.service';
import { automationTaskLockService } from '../core/automation-task-lock.service';
import { automationRunService } from '../core/automation-run.service';
import logger from '../../../utils/logger';

type TaskSource = 'cron' | 'manual';

async function runWithAudit<T extends Record<string, unknown>>(
    key: AutomationTaskKey,
    source: TaskSource,
    run: () => Promise<T>
): Promise<T> {
    const task = getAutomationTaskRegistryItem(key);
    if (!task) {
        throw new Error(`Unknown automation task: ${key}`);
    }

    let lock: { acquired: boolean; ownerId: string } | null = null;
    try {
        lock = await automationTaskLockService.acquire(task);
    } catch (acquireErr: any) {
        logger.warn(`[Automation] ${task.key} lock acquire failed: ${acquireErr?.message || 'Unknown error'}`);
        return { skipped: true, reason: 'lock_acquire_failed' } as unknown as T;
    }

    if (!lock.acquired) {
        logger.warn(`[Automation] ${task.key} skipped because another run holds the distributed lock.`);
        return { skipped: true, reason: 'task_locked' } as unknown as T;
    }

    const runRecord = await automationRunService.startRun({
        taskKey: task.key,
        taskLabel: task.label,
        category: task.category,
        source,
    });

    auditLogSafe({
        message: `Automation started: ${task.label}`,
        type: 'cron_started',
        category: task.category,
        actorType: 'system',
        source,
    });

    try {
        const result = await run();
        const normalizedResult =
            typeof result === 'object' && result !== null
                ? (result as Record<string, unknown>)
                : { result };

        await automationRunService.completeRun(runRecord._id.toString(), {
            status: 'success',
            result: normalizedResult,
        });
        await automationAlertService.recordSuccess(task, source);

        auditLogSafe({
            message: `Automation completed: ${task.label}`,
            type: 'cron_completed',
            category: task.category,
            actorType: 'system',
            source,
            meta: normalizedResult,
        });
        return result;
    } catch (error: any) {
        await automationRunService.completeRun(runRecord._id.toString(), {
            status: 'failure',
            errorMessage: error?.message || 'Unknown error',
        });
        await automationAlertService.recordFailure(task, source, error?.message || 'Unknown error');

        auditLogSafe({
            message: `Automation failed: ${task.label}`,
            type: 'cron_completed',
            category: task.category,
            actorType: 'system',
            source,
            status: 'failure',
            severity: 'high',
            meta: { error: error?.message || 'Unknown error' },
        });
        logger.error(`[Automation] ${task.key} failed: ${error?.message || error}`);
        throw error;
    } finally {
        if (lock?.acquired && lock?.ownerId) {
            automationTaskLockService.release(task.key, lock.ownerId).catch((err: any) =>
                logger.warn(`[Automation] ${task.key} lock release failed: ${err?.message || err}`)
            );
        }
    }
}

class AutomationTasksService {
    runRenewals(source: TaskSource = 'cron') {
        return runWithAudit('renewals', source, async () => {
            const result = await serviceRenewalScheduler.processRenewals();
            return {
                ...result,
                actionJobsProcessed: 0,
            };
        });
    }

    runOverdueSuspensions(source: TaskSource = 'cron') {
        return runWithAudit('overdue-suspensions', source, async () => {
            const suspendedCount = await serviceRenewalScheduler.processOverdueEnforcements();
            const actionJobsProcessed = await serviceActionWorker.processQueuedJobs();
            return { suspendedCount, actionJobsProcessed };
        });
    }

    runBillableItemsRecurring(source: TaskSource = 'cron') {
        return runWithAudit('billable-items-recurring', source, async () => {
            const result = await billableItemService.processRecurringDueItems(source);
            return result;
        });
    }

    runInvoiceReminders(source: TaskSource = 'cron') {
        return runWithAudit('invoice-reminders', source, () =>
            invoiceReminderScheduler.processReminders()
        );
    }

    runTerminations(source: TaskSource = 'cron') {
        return runWithAudit('terminations', source, async () => {
            const warnings = await serviceTerminationScheduler.processTerminationWarnings();
            const terminatedCount = await serviceTerminationScheduler.processTerminations();
            const actionJobsProcessed = await serviceActionWorker.processQueuedJobs();
            return { ...warnings, terminatedCount, actionJobsProcessed };
        });
    }

    runUsageSync(source: TaskSource = 'cron') {
        return runWithAudit('usage-sync', source, () =>
            usageSyncScheduler.processUsageSync()
        );
    }

    runProvisioningWorker(source: TaskSource = 'cron') {
        return runWithAudit('provisioning-worker', source, async () => {
            const processed = await provisioningWorker.processQueuedJobs();
            return { processed };
        });
    }

    runActionWorker(source: TaskSource = 'cron') {
        return runWithAudit('action-worker', source, async () => {
            const processed = await serviceActionWorker.processQueuedJobs();
            return { processed };
        });
    }

    runDomainSync(source: TaskSource = 'cron') {
        return runWithAudit('domain-sync', source, async () => {
            const transferSync = await domainSyncScheduler.processDomainTransferSync();
            const expirySync = await domainSyncScheduler.processDomainExpirySync();
            const domainReminders = await domainExpiryReminderScheduler.processDomainExpiryReminders();
            return { transferSync, expirySync, domainReminders };
        });
    }

    runDigestEmail(source: TaskSource = 'cron') {
        return runWithAudit('digest-email', source, async () =>
            automationDigestService.sendLatestDigest()
        );
    }

    runTaskByKey(taskKey: AutomationTaskKey, source: TaskSource = 'cron') {
        switch (taskKey) {
            case 'renewals':
                return this.runRenewals(source);
            case 'billable-items-recurring':
                return this.runBillableItemsRecurring(source);
            case 'overdue-suspensions':
                return this.runOverdueSuspensions(source);
            case 'invoice-reminders':
                return this.runInvoiceReminders(source);
            case 'terminations':
                return this.runTerminations(source);
            case 'usage-sync':
                return this.runUsageSync(source);
            case 'action-worker':
                return this.runActionWorker(source);
            case 'provisioning-worker':
                return this.runProvisioningWorker(source);
            case 'domain-sync':
                return this.runDomainSync(source);
            case 'digest-email':
                return this.runDigestEmail(source);
            default:
                throw new Error(`Unsupported automation task: ${taskKey}`);
        }
    }
}

export const automationTasksService = new AutomationTasksService();

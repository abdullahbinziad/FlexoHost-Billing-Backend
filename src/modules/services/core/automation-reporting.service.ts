import AutomationRun from '../models/automation-run.model';
import { getAutomationTaskRegistry } from '../jobs/automation-task.registry';

export interface TimeRange {
    start: Date;
    end: Date;
}

interface TaskAggregate {
    taskKey: string;
    label: string;
    category: string;
    successRuns: number;
    failureRuns: number;
    totalRuns: number;
    lastStatus?: 'running' | 'success' | 'failure';
    lastStartedAt?: Date;
    metrics: Record<string, number>;
}

function getNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getNestedNumber(input: Record<string, unknown> | undefined, path: string[]): number {
    let current: unknown = input;
    for (const key of path) {
        if (!current || typeof current !== 'object') return 0;
        current = (current as Record<string, unknown>)[key];
    }
    return getNumber(current);
}

function sumNumbers(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0);
}

export class AutomationReportingService {
    async getTaskAggregates(range: TimeRange): Promise<TaskAggregate[]> {
        const runs = await AutomationRun.find({
            startedAt: { $gte: range.start, $lte: range.end },
        })
            .sort({ startedAt: -1, _id: -1 })
            .lean()
            .exec();

        return getAutomationTaskRegistry().map((task) => {
            const taskRuns = runs.filter((run) => run.taskKey === task.key);
            const successfulRuns = taskRuns.filter((run) => run.status === 'success');
            const failedRuns = taskRuns.filter((run) => run.status === 'failure');
            const latestRun = taskRuns[0];

            return {
                taskKey: task.key,
                label: task.label,
                category: task.category,
                successRuns: successfulRuns.length,
                failureRuns: failedRuns.length,
                totalRuns: taskRuns.length,
                lastStatus: latestRun?.status,
                lastStartedAt: latestRun?.startedAt,
                metrics: this.extractMetrics(task.key, successfulRuns.map((run) => (run.result ?? {}) as Record<string, unknown>)),
            };
        });
    }

    private extractMetrics(taskKey: string, results: Record<string, unknown>[]): Record<string, number> {
        switch (taskKey) {
            case 'renewals':
                return {
                    invoicesCreated: sumNumbers(results.map((result) => getNestedNumber(result, ['invoicesCreated']))),
                    itemsCreated: sumNumbers(results.map((result) => getNestedNumber(result, ['itemsCreated']))),
                    servicesFound: sumNumbers(results.map((result) => getNestedNumber(result, ['servicesFound']))),
                };
            case 'overdue-suspensions':
                return {
                    suspendedCount: sumNumbers(results.map((result) => getNestedNumber(result, ['suspendedCount']))),
                    actionJobsProcessed: sumNumbers(results.map((result) => getNestedNumber(result, ['actionJobsProcessed']))),
                };
            case 'invoice-reminders':
                return {
                    remindersSent: sumNumbers(results.map((result) => getNestedNumber(result, ['remindersSent']))),
                    overdueMarked: sumNumbers(results.map((result) => getNestedNumber(result, ['overdueMarked']))),
                    lateFeesApplied: sumNumbers(results.map((result) => getNestedNumber(result, ['lateFeesApplied']))),
                };
            case 'terminations':
                return {
                    terminatedCount: sumNumbers(results.map((result) => getNestedNumber(result, ['terminatedCount']))),
                    warningsSent: sumNumbers(results.map((result) => getNestedNumber(result, ['warningsSent']))),
                    actionJobsProcessed: sumNumbers(results.map((result) => getNestedNumber(result, ['actionJobsProcessed']))),
                };
            case 'usage-sync':
                return {
                    processed: sumNumbers(results.map((result) => getNestedNumber(result, ['processed']))),
                    failed: sumNumbers(results.map((result) => getNestedNumber(result, ['failed']))),
                };
            case 'action-worker':
            case 'provisioning-worker':
                return {
                    processed: sumNumbers(results.map((result) => getNestedNumber(result, ['processed']))),
                };
            case 'domain-sync':
                return {
                    transferChecks: sumNumbers(results.map((result) => getNestedNumber(result, ['transferSync', 'syncedCount']))),
                    transferCompleted: sumNumbers(results.map((result) => getNestedNumber(result, ['transferSync', 'completedCount']))),
                    domainsSynced: sumNumbers(results.map((result) => getNestedNumber(result, ['expirySync', 'syncedCount']))),
                    driftAlerts: sumNumbers(results.map((result) => getNestedNumber(result, ['expirySync', 'driftDetectedAlerts']))),
                };
            case 'digest-email':
                return {
                    emailsSent: sumNumbers(results.map((result) => getNestedNumber(result, ['emailsSent']))),
                    recipients: sumNumbers(results.map((result) => getNestedNumber(result, ['recipientCount']))),
                };
            default:
                return {};
        }
    }
}

export const automationReportingService = new AutomationReportingService();

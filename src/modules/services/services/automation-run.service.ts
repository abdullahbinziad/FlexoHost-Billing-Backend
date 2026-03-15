import AutomationRun, {
    AutomationRunSource,
    AutomationRunStatus,
} from '../models/automation-run.model';
import AutomationAlertState from '../models/automation-alert-state.model';
import config from '../../../config';
import {
    AutomationTaskRegistryItem,
    getAutomationTaskRegistry,
} from '../jobs/automation-task.registry';

interface StartRunInput {
    taskKey: string;
    taskLabel: string;
    category: string;
    source: AutomationRunSource;
}

interface CompleteRunInput {
    status: Exclude<AutomationRunStatus, 'running'>;
    result?: Record<string, unknown>;
    errorMessage?: string;
}

interface ListRunsOptions {
    page?: number;
    limit?: number;
    taskKey?: string;
    status?: AutomationRunStatus;
    source?: AutomationRunSource;
}

class AutomationRunService {
    async startRun(input: StartRunInput) {
        return AutomationRun.create({
            ...input,
            status: 'running',
            startedAt: new Date(),
        });
    }

    async completeRun(runId: string, input: CompleteRunInput) {
        const now = new Date();
        const current = await AutomationRun.findById(runId).select('startedAt').exec();
        const durationMs = current?.startedAt
            ? Math.max(now.getTime() - current.startedAt.getTime(), 0)
            : undefined;

        await AutomationRun.findByIdAndUpdate(runId, {
            $set: {
                status: input.status,
                completedAt: now,
                durationMs,
                result: input.result,
                errorMessage: input.errorMessage,
            },
        }).exec();
    }

    async listRuns(options: ListRunsOptions = {}) {
        const page = Math.max(Number(options.page) || 1, 1);
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);

        const filter: Record<string, unknown> = {};
        if (options.taskKey) filter.taskKey = options.taskKey;
        if (options.status) filter.status = options.status;
        if (options.source) filter.source = options.source;

        const [results, totalResults] = await Promise.all([
            AutomationRun.find(filter)
                .sort({ startedAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
                .exec(),
            AutomationRun.countDocuments(filter).exec(),
        ]);

        return {
            results,
            page,
            limit,
            totalResults,
            totalPages: Math.max(Math.ceil(totalResults / limit), 1),
        };
    }

    async getSummary() {
        const tasks = getAutomationTaskRegistry();
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const alertStates = await AutomationAlertState.find({
            taskKey: { $in: tasks.map((task) => task.key) },
        }).lean().exec();
        const alertStateMap = new Map(alertStates.map((state) => [state.taskKey, state]));

        const summaries = await Promise.all(
            tasks.map(async (task) => {
                const [lastRun, successCount24h, failureCount24h, runningCount] = await Promise.all([
                    AutomationRun.findOne({ taskKey: task.key }).sort({ startedAt: -1, _id: -1 }).lean().exec(),
                    AutomationRun.countDocuments({
                        taskKey: task.key,
                        status: 'success',
                        startedAt: { $gte: since24h },
                    }).exec(),
                    AutomationRun.countDocuments({
                        taskKey: task.key,
                        status: 'failure',
                        startedAt: { $gte: since24h },
                    }).exec(),
                    AutomationRun.countDocuments({
                        taskKey: task.key,
                        status: 'running',
                    }).exec(),
                ]);

                return this.mapTaskSummary(task, {
                    lastRun,
                    successCount24h,
                    failureCount24h,
                    runningCount,
                    alertState: alertStateMap.get(task.key),
                });
            })
        );

        return {
            cronEnabled: config.cron.enabled,
            alertsEnabled: config.automationAlerts.enabled,
            alertThreshold: config.automationAlerts.failureThreshold,
            alertChannels: {
                email: config.automationAlerts.emailTo.length > 0,
                webhook: Boolean(config.automationAlerts.webhookUrl),
            },
            tasks: summaries,
            totals: {
                tasks: summaries.length,
                running: summaries.filter((task) => task.runningCount > 0).length,
                healthy: summaries.filter((task) => task.lastRun?.status === 'success' || !task.lastRun).length,
                failures24h: summaries.reduce((sum, task) => sum + task.failureCount24h, 0),
                successes24h: summaries.reduce((sum, task) => sum + task.successCount24h, 0),
            },
        };
    }

    private mapTaskSummary(
        task: AutomationTaskRegistryItem,
        data: {
            lastRun: any;
            successCount24h: number;
            failureCount24h: number;
            runningCount: number;
            alertState?: any;
        }
    ) {
        return {
            key: task.key,
            label: task.label,
            category: task.category,
            description: task.description,
            intervalMs: task.intervalMs,
            runOnStart: task.runOnStart,
            successCount24h: data.successCount24h,
            failureCount24h: data.failureCount24h,
            runningCount: data.runningCount,
            consecutiveFailures: data.alertState?.consecutiveFailures ?? 0,
            alertOpen: Boolean(data.alertState?.alertOpen),
            lastRun: data.lastRun
                ? {
                    id: data.lastRun._id?.toString?.() || String(data.lastRun._id),
                    status: data.lastRun.status,
                    source: data.lastRun.source,
                    startedAt: data.lastRun.startedAt,
                    completedAt: data.lastRun.completedAt,
                    durationMs: data.lastRun.durationMs,
                    errorMessage: data.lastRun.errorMessage,
                    result: data.lastRun.result,
                }
                : null,
        };
    }
}

export const automationRunService = new AutomationRunService();

import config from '../../../config';
import logger from '../../../utils/logger';
import { automationTasksService } from './automation-tasks.service';
import { getAutomationTaskRegistry } from './automation-task.registry';

interface AutomationTaskDefinition {
    key: string;
    intervalMs: number;
    runOnStart?: boolean;
    run: () => Promise<unknown>;
}

class AutomationScheduler {
    private timers = new Map<string, NodeJS.Timeout>();
    private runningTasks = new Set<string>();

    start(): void {
        if (!config.cron.enabled) {
            logger.info('[AutomationScheduler] Cron scheduler disabled by configuration.');
            return;
        }

        const taskDefinitions: AutomationTaskDefinition[] = [
            ...getAutomationTaskRegistry().map((task) => ({
                key: task.key,
                intervalMs: task.intervalMs,
                runOnStart: task.runOnStart,
                run: () => automationTasksService.runTaskByKey(task.key, 'cron'),
            })),
        ];

        for (const task of taskDefinitions) {
            if (!Number.isFinite(task.intervalMs) || task.intervalMs <= 0) {
                logger.warn(`[AutomationScheduler] Skipping task ${task.key}: invalid interval ${task.intervalMs}`);
                continue;
            }

            const invoke = () => {
                void this.runTask(task);
            };

            if (task.runOnStart) {
                invoke();
            }

            const timer = setInterval(invoke, task.intervalMs);
            this.timers.set(task.key, timer);
            logger.info(`[AutomationScheduler] Registered task ${task.key} every ${task.intervalMs}ms`);
        }
    }

    stop(): void {
        for (const timer of this.timers.values()) {
            clearInterval(timer);
        }
        this.timers.clear();
        this.runningTasks.clear();
    }

    private async runTask(task: AutomationTaskDefinition): Promise<void> {
        if (this.runningTasks.has(task.key)) {
            logger.warn(`[AutomationScheduler] Task ${task.key} is already running; skipping overlap.`);
            return;
        }

        this.runningTasks.add(task.key);
        try {
            await task.run();
        } finally {
            this.runningTasks.delete(task.key);
        }
    }
}

export const automationScheduler = new AutomationScheduler();

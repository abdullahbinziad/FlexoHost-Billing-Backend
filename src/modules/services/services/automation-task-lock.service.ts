import crypto from 'crypto';
import type { AutomationTaskRegistryItem } from '../jobs/automation-task.registry';
import AutomationTaskLock from '../models/automation-task-lock.model';

class AutomationTaskLockService {
    async acquire(task: AutomationTaskRegistryItem): Promise<{ acquired: boolean; ownerId: string }> {
        const now = new Date();
        const ownerId = crypto.randomUUID();
        const lockDurationMs = Math.max(task.intervalMs * 2, 5 * 60 * 1000);
        const lockedUntil = new Date(now.getTime() + lockDurationMs);

        try {
            const updated = await AutomationTaskLock.findOneAndUpdate(
                {
                    taskKey: task.key,
                    $or: [
                        { lockedUntil: { $lte: now } },
                        { lockedUntil: { $exists: false } },
                    ],
                },
                {
                    $set: {
                        ownerId,
                        lockedUntil,
                        lastStartedAt: now,
                    },
                    $setOnInsert: {
                        taskKey: task.key,
                    },
                },
                {
                    upsert: true,
                    new: true,
                }
            ).exec();

            return { acquired: updated?.ownerId === ownerId, ownerId };
        } catch (error: any) {
            if (error?.code === 11000) {
                return { acquired: false, ownerId };
            }
            throw error;
        }
    }

    async release(taskKey: string, ownerId: string): Promise<void> {
        await AutomationTaskLock.updateOne(
            {
                taskKey,
                ownerId,
            },
            {
                $set: {
                    lockedUntil: new Date(0),
                },
            }
        ).exec();
    }
}

export const automationTaskLockService = new AutomationTaskLockService();

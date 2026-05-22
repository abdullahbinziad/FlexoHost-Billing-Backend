import config from '../../../config';
import { auditLogSafe } from '../../activity-log/activity-log.service';
import { adminAlertService } from '../../notification/admin-alert.service';
import type { AutomationTaskRegistryItem } from '../jobs/automation-task.registry';
import AutomationAlertState from '../models/automation-alert-state.model';

type AlertSource = 'cron' | 'manual';

class AutomationAlertService {
    async recordFailure(
        task: AutomationTaskRegistryItem,
        source: AlertSource,
        errorMessage: string
    ): Promise<void> {
        if (source !== 'cron') {
            return;
        }

        const now = new Date();
        const state = await AutomationAlertState.findOne({ taskKey: task.key }).exec()
            || new AutomationAlertState({ taskKey: task.key });

        const consecutiveFailures = (state.consecutiveFailures || 0) + 1;
        if (!state.firstFailureAt) {
            state.firstFailureAt = now;
        }
        state.consecutiveFailures = consecutiveFailures;
        state.lastFailureAt = now;
        state.lastFailureMessage = errorMessage;

        const threshold = Math.max(config.automationAlerts.failureThreshold, 1);
        const repeatEveryFailures = Math.max(config.automationAlerts.repeatEveryFailures, 1);
        const shouldAlert = config.automationAlerts.enabled
            && consecutiveFailures >= threshold
            && (
                !state.lastAlertedFailureCount
                || consecutiveFailures - state.lastAlertedFailureCount >= repeatEveryFailures
            );

        if (shouldAlert) {
            const delivery = await this.sendFailureAlert(task, consecutiveFailures, errorMessage);
            if (delivery.delivered) {
                state.lastAlertedFailureCount = consecutiveFailures;
                state.lastAlertedAt = now;
                state.alertOpen = true;

                auditLogSafe({
                    message: `Automation failure alert sent for ${task.label}`,
                    type: 'automation_summary',
                    category: 'automation',
                    actorType: 'system',
                    source: 'cron',
                    status: 'failure',
                    severity: 'high',
                    meta: {
                        taskKey: task.key,
                        consecutiveFailures,
                        permission: 'notifications:automation_failure',
                    },
                });
            }
        }

        await state.save();
    }

    async recordSuccess(
        task: AutomationTaskRegistryItem,
        source: AlertSource
    ): Promise<void> {
        const state = await AutomationAlertState.findOne({ taskKey: task.key }).exec();
        if (!state) {
            return;
        }

        const hadOpenAlert = state.alertOpen;

        state.consecutiveFailures = 0;
        state.firstFailureAt = undefined;
        state.lastFailureAt = undefined;
        state.lastFailureMessage = undefined;
        state.lastSuccessAt = new Date();
        state.alertOpen = false;
        state.lastAlertedFailureCount = 0;

        await state.save();

        if (
            hadOpenAlert
            && config.automationAlerts.enabled
            && config.automationAlerts.sendRecovery
        ) {
            const delivery = await this.sendRecoveryAlert(task, source);
            if (delivery.delivered) {
                auditLogSafe({
                    message: `Automation recovery alert sent for ${task.label}`,
                    type: 'automation_summary',
                    category: 'automation',
                    actorType: 'system',
                    source: source === 'cron' ? 'cron' : 'system',
                    status: 'success',
                    meta: {
                        taskKey: task.key,
                        permission: 'notifications:automation_failure',
                    },
                });
            }
        }
    }

    private async sendFailureAlert(
        task: AutomationTaskRegistryItem,
        consecutiveFailures: number,
        errorMessage: string
    ): Promise<{ delivered: boolean }> {
        const subject = `[Automation Alert] ${task.label} failing repeatedly (${consecutiveFailures} failures)`;
        const dashboardUrl = `${config.frontendUrl.replace(/\/$/, '')}/admin/automation`;
        const text = [
            `${task.label} (${task.key}) is failing repeatedly.`,
            `Consecutive failures: ${consecutiveFailures}`,
            `Category: ${task.category}`,
            `Latest error: ${errorMessage}`,
            `Dashboard: ${dashboardUrl}`,
        ].join('\n');
        const html = [
            `<p><strong>${task.label}</strong> (<code>${task.key}</code>) is failing repeatedly.</p>`,
            `<p><strong>Consecutive failures:</strong> ${consecutiveFailures}</p>`,
            `<p><strong>Category:</strong> ${task.category}</p>`,
            `<p><strong>Latest error:</strong> ${this.escapeHtml(errorMessage)}</p>`,
            `<p><a href="${dashboardUrl}">Open automation monitor</a></p>`,
        ].join('');

        const result = await adminAlertService.notify({
            permission: 'notifications:automation_failure',
            category: 'automation',
            severity: 'high',
            source: 'cron',
            title: `${task.label} failing repeatedly`,
            message: `${task.label} failed ${consecutiveFailures} consecutive time(s): ${errorMessage}`,
            linkPath: '/admin/automation',
            linkLabel: 'Open automation monitor',
            email: { subject, text, html },
            meta: {
                type: 'automation_failure',
                taskKey: task.key,
                taskLabel: task.label,
                taskCategory: task.category,
                consecutiveFailures,
            },
        });
        return { delivered: result.recipientCount > 0 };
    }

    private async sendRecoveryAlert(
        task: AutomationTaskRegistryItem,
        source: AlertSource
    ): Promise<{ delivered: boolean }> {
        const subject = `[Automation Recovery] ${task.label} recovered`;
        const dashboardUrl = `${config.frontendUrl.replace(/\/$/, '')}/admin/automation`;
        const text = [
            `${task.label} (${task.key}) recovered successfully.`,
            `Recovery source: ${source}`,
            `Dashboard: ${dashboardUrl}`,
        ].join('\n');
        const html = [
            `<p><strong>${task.label}</strong> (<code>${task.key}</code>) recovered successfully.</p>`,
            `<p><strong>Recovery source:</strong> ${source}</p>`,
            `<p><a href="${dashboardUrl}">Open automation monitor</a></p>`,
        ].join('');

        const result = await adminAlertService.notify({
            permission: 'notifications:automation_failure',
            category: 'automation',
            severity: 'medium',
            source: source === 'cron' ? 'cron' : 'system',
            title: `${task.label} recovered`,
            message: `${task.label} recovered successfully.`,
            linkPath: '/admin/automation',
            linkLabel: 'Open automation monitor',
            email: { subject, text, html },
            meta: {
                type: 'automation_recovery',
                taskKey: task.key,
                taskLabel: task.label,
                taskCategory: task.category,
                source,
            },
        });
        return { delivered: result.recipientCount > 0 };
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

export const automationAlertService = new AutomationAlertService();

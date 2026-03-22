import config from '../../../config';
import logger from '../../../utils/logger';
import emailService from '../../email/email.service';
import { auditLogSafe } from '../../activity-log/activity-log.service';
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

        const channels = this.getEnabledChannels();
        const threshold = Math.max(config.automationAlerts.failureThreshold, 1);
        const repeatEveryFailures = Math.max(config.automationAlerts.repeatEveryFailures, 1);
        const shouldAlert = config.automationAlerts.enabled
            && channels.length > 0
            && consecutiveFailures >= threshold
            && (
                !state.lastAlertedFailureCount
                || consecutiveFailures - state.lastAlertedFailureCount >= repeatEveryFailures
            );

        if (shouldAlert) {
            const delivery = await this.sendFailureAlert(task, consecutiveFailures, errorMessage, channels);
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
                        channels,
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
        const channels = this.getEnabledChannels();

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
            && channels.length > 0
        ) {
            const delivery = await this.sendRecoveryAlert(task, source, channels);
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
                        channels,
                    },
                });
            }
        }
    }

    private getEnabledChannels(): string[] {
        const channels: string[] = [];
        if (config.automationAlerts.emailTo.length > 0) {
            channels.push('email');
        }
        if (config.automationAlerts.webhookUrl) {
            channels.push('webhook');
        }
        return channels;
    }

    private async sendFailureAlert(
        task: AutomationTaskRegistryItem,
        consecutiveFailures: number,
        errorMessage: string,
        channels: string[]
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

        return this.sendNotifications({
            subject,
            text,
            html,
            payload: {
                type: 'automation_failure',
                taskKey: task.key,
                taskLabel: task.label,
                category: task.category,
                consecutiveFailures,
                errorMessage,
                dashboardUrl,
                channels,
            },
        });
    }

    private async sendRecoveryAlert(
        task: AutomationTaskRegistryItem,
        source: AlertSource,
        channels: string[]
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

        return this.sendNotifications({
            subject,
            text,
            html,
            payload: {
                type: 'automation_recovery',
                taskKey: task.key,
                taskLabel: task.label,
                category: task.category,
                source,
                dashboardUrl,
                channels,
            },
        });
    }

    private async sendNotifications(input: {
        subject: string;
        text: string;
        html: string;
        payload: Record<string, unknown>;
    }): Promise<{ delivered: boolean }> {
        let delivered = false;
        if (config.automationAlerts.emailTo.length > 0) {
            for (const recipient of config.automationAlerts.emailTo) {
                try {
                    const result = await emailService.sendEmail({
                        to: recipient,
                        subject: input.subject,
                        text: input.text,
                        html: input.html,
                    });
                    if (result.success) {
                        delivered = true;
                    } else {
                        logger.warn(`[AutomationAlerts] Email delivery failed for ${recipient}: ${result.error || 'Unknown error'}`);
                    }
                } catch (error: any) {
                    logger.error(`[AutomationAlerts] Email send failed: ${error?.message || error}`);
                }
            }
        }

        if (config.automationAlerts.webhookUrl) {
            try {
                await fetch(config.automationAlerts.webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(input.payload),
                });
                delivered = true;
            } catch (error: any) {
                logger.error(`[AutomationAlerts] Webhook send failed: ${error?.message || error}`);
            }
        }

        return { delivered };
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

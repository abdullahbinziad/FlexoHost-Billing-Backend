import config from '../../../config';
import { escapeHtml } from '../../../utils/string.util';
import emailService from '../../email/email.service';
import logger from '../../../utils/logger';
import AutomationDigestLog from '../models/automation-digest-log.model';
import { automationReportingService } from './automation-reporting.service';
import { getDailyActionsStatsForRange } from '../../dashboard/dashboard.service';

function formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
    }).format(date);
}

export class AutomationDigestService {
    private resolveCompletedWindow(now = new Date()): { start: Date; end: Date } {
        const periodHours = Math.max(config.automationDigest.periodHours, 1);
        const periodMs = periodHours * 60 * 60 * 1000;
        const end = new Date(Math.floor(now.getTime() / periodMs) * periodMs);
        const start = new Date(end.getTime() - periodMs);
        return { start, end };
    }

    async sendLatestDigest(): Promise<Record<string, unknown>> {
        const recipients = config.automationDigest.emailTo;
        if (!config.automationDigest.enabled) {
            return { skipped: true, reason: 'digest_disabled' };
        }
        if (recipients.length === 0) {
            return { skipped: true, reason: 'no_recipients' };
        }

        const { start, end } = this.resolveCompletedWindow();
        const existingDigest = await AutomationDigestLog.findOne({
            taskKey: 'digest-email',
            periodStart: start,
            periodEnd: end,
        }).lean().exec();

        if (existingDigest) {
            return {
                skipped: true,
                reason: 'already_sent',
                periodStart: start.toISOString(),
                periodEnd: end.toISOString(),
            };
        }

        const [taskAggregates, dailyStats] = await Promise.all([
            automationReportingService.getTaskAggregates({
                start,
                end: new Date(end.getTime() - 1),
            }),
            getDailyActionsStatsForRange({
                start,
                end: new Date(end.getTime() - 1),
            }),
        ]);

        const successRuns = taskAggregates.reduce((sum, task) => sum + task.successRuns, 0);
        const failureRuns = taskAggregates.reduce((sum, task) => sum + task.failureRuns, 0);
        const hasActivity = successRuns > 0
            || failureRuns > 0
            || dailyStats.invoices.generated > 0
            || dailyStats.creditCardCharges.captured > 0
            || dailyStats.creditCardCharges.declined > 0
            || dailyStats.inactiveTickets.closed > 0;

        if (!hasActivity && !config.automationDigest.includeEmpty) {
            return {
                skipped: true,
                reason: 'empty_window',
                periodStart: start.toISOString(),
                periodEnd: end.toISOString(),
            };
        }

        const subject = `[Automation Digest] ${formatDateTime(start)} to ${formatDateTime(new Date(end.getTime() - 1))}`;
        const dashboardUrl = `${config.frontendUrl.replace(/\/$/, '')}/admin/automation`;
        const lines = taskAggregates.map((task) => {
            const metricSummary = Object.entries(task.metrics)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            return `<tr>
                <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(task.label)}</td>
                <td style="padding:8px;border:1px solid #ddd;">${task.successRuns}</td>
                <td style="padding:8px;border:1px solid #ddd;">${task.failureRuns}</td>
                <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(metricSummary || 'No counted output')}</td>
            </tr>`;
        }).join('');

        const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
                <h2>Automation Digest</h2>
                <p><strong>Window:</strong> ${escapeHtml(formatDateTime(start))} to ${escapeHtml(formatDateTime(new Date(end.getTime() - 1)))}</p>
                <p><strong>Invoices generated:</strong> ${dailyStats.invoices.generated}<br/>
                <strong>Reminders sent:</strong> ${dailyStats.invoiceReminders.sent}<br/>
                <strong>Overdue suspensions:</strong> ${dailyStats.overdueSuspensions.suspended}<br/>
                <strong>Domain transfers checked:</strong> ${dailyStats.domainTransferSync.transfersChecked}<br/>
                <strong>Domain status sync:</strong> ${dailyStats.domainStatusSync.domainsSynced}</p>
                <table style="border-collapse:collapse;width:100%;margin-top:16px;">
                    <thead>
                        <tr>
                            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Task</th>
                            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Success Runs</th>
                            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Failure Runs</th>
                            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Output</th>
                        </tr>
                    </thead>
                    <tbody>${lines}</tbody>
                </table>
                <p style="margin-top:16px;"><a href="${dashboardUrl}">Open automation monitor</a></p>
            </div>
        `;
        const text = [
            'Automation Digest',
            `Window: ${formatDateTime(start)} to ${formatDateTime(new Date(end.getTime() - 1))}`,
            `Invoices generated: ${dailyStats.invoices.generated}`,
            `Reminders sent: ${dailyStats.invoiceReminders.sent}`,
            `Overdue suspensions: ${dailyStats.overdueSuspensions.suspended}`,
            `Domain transfers checked: ${dailyStats.domainTransferSync.transfersChecked}`,
            `Domain status sync: ${dailyStats.domainStatusSync.domainsSynced}`,
            '',
            ...taskAggregates.map((task) => {
                const metrics = Object.entries(task.metrics)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');
                return `${task.label} | success: ${task.successRuns} | failure: ${task.failureRuns}${metrics ? ` | ${metrics}` : ''}`;
            }),
            '',
            `Dashboard: ${dashboardUrl}`,
        ].join('\n');

        let emailsSent = 0;
        for (const recipient of recipients) {
            const result = await emailService.sendEmail({
                to: recipient,
                subject,
                html,
                text,
            });
            if (result.success) {
                emailsSent += 1;
            } else {
                logger.warn(`[AutomationDigest] Failed sending digest to ${recipient}: ${result.error || 'Unknown error'}`);
            }
        }

        await AutomationDigestLog.create({
            taskKey: 'digest-email',
            periodStart: start,
            periodEnd: end,
            recipientCount: recipients.length,
            sentAt: new Date(),
            meta: {
                emailsSent,
                successRuns,
                failureRuns,
            },
        });

        return {
            emailsSent,
            recipientCount: recipients.length,
            successRuns,
            failureRuns,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
        };
    }
}

export const automationDigestService = new AutomationDigestService();

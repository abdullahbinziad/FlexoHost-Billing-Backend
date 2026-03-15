import Invoice from '../../invoice/invoice.model';
import InvoiceReminderLog from '../../invoice/invoice-reminder-log.model';
import { notificationProvider } from '../providers/notification.provider';
import { InvoiceStatus, InvoiceItemType } from '../../invoice/invoice.interface';
import { auditLogSafe } from '../../activity-log/activity-log.service';
import logger from '../../../utils/logger';
import { getBillingSettings } from '../../settings/billing-settings.service';
import type { BillingSettingsDto } from '../../settings/billing-settings.service';

function getTemplateForReminderType(reminderType: string): string {
    if (reminderType === 'DUE_TODAY') return 'invoice-due-today';
    if (reminderType.startsWith('PRE_')) return 'invoice-pre-reminder';
    if (reminderType.startsWith('SUSPEND_WARN_')) return 'invoice-overdue-7';
    if (reminderType.startsWith('OVERDUE_')) {
        const days = parseInt(reminderType.replace('OVERDUE_', ''), 10) || 0;
        if (days <= 3) return 'invoice-overdue-3';
        if (days <= 7) return 'invoice-overdue-7';
        return 'invoice-overdue-14';
    }
    return 'invoice-pre-reminder';
}

function getSubjectForReminderType(reminderType: string): string {
    if (reminderType === 'DUE_TODAY') return 'Invoice due notice';
    if (reminderType.startsWith('PRE_')) return 'Invoice payment reminder';
    if (reminderType.startsWith('SUSPEND_WARN_')) return 'Invoice overdue suspension warning';
    if (reminderType.startsWith('OVERDUE_')) return 'Invoice overdue notice';
    return 'Invoice payment reminder';
}

export class InvoiceReminderScheduler {
    private resolveReminder(diffDays: number, settings: BillingSettingsDto): {
        reminderType: string;
        emailSubject: string;
        emailTemplate: string;
    } | null {
        const preDays = [...(settings.preReminderDays ?? [])].filter((d) => d > 0).sort((a, b) => b - a);
        const overdueDays = [...(settings.overdueReminderDays ?? [])].filter((d) => d > 0).sort((a, b) => a - b);
        const suspendWarnDays = [...(settings.suspendWarningDays ?? [])].filter((d) => d > 0);
        const daysBeforeSuspend = settings.daysBeforeSuspend ?? 5;

        if (diffDays < 0) {
            const targetPre = [...preDays].sort((a, b) => a - b).find((d) => d >= -diffDays);
            if (targetPre) {
                return {
                    reminderType: `PRE_${targetPre}`,
                    emailSubject: getSubjectForReminderType(`PRE_${targetPre}`),
                    emailTemplate: getTemplateForReminderType(`PRE_${targetPre}`),
                };
            }
            return null;
        }

        if (diffDays === 0 && (settings.reminderDueTodayEnabled ?? true)) {
            return {
                reminderType: 'DUE_TODAY',
                emailSubject: 'Invoice due notice',
                emailTemplate: 'invoice-due-today',
            };
        }

        if (diffDays > 0) {
            const suspendDaysToSend = suspendWarnDays
                .map((x) => daysBeforeSuspend - x)
                .filter((d) => d > 0 && d <= diffDays);
            if (suspendDaysToSend.includes(diffDays)) {
                const x = daysBeforeSuspend - diffDays;
                return {
                    reminderType: `SUSPEND_WARN_${x}`,
                    emailSubject: 'Invoice overdue suspension warning',
                    emailTemplate: 'invoice-overdue-7',
                };
            }

            const targetOverdue = overdueDays.filter((d) => d <= diffDays).pop();
            if (targetOverdue) {
                return {
                    reminderType: `OVERDUE_${targetOverdue}`,
                    emailSubject: getSubjectForReminderType(`OVERDUE_${targetOverdue}`),
                    emailTemplate: getTemplateForReminderType(`OVERDUE_${targetOverdue}`),
                };
            }
        }

        return null;
    }

    private async markOverdueInvoices(startOfToday: Date): Promise<number> {
        const result = await Invoice.updateMany(
            {
                status: InvoiceStatus.UNPAID,
                dueDate: { $lt: startOfToday },
            },
            {
                $set: { status: InvoiceStatus.OVERDUE },
            }
        ).exec();

        return result.modifiedCount ?? 0;
    }

    /**
     * Apply late fee to overdue invoices when overdueExtraChargeDays has passed.
     */
    private async applyLateFees(settings: BillingSettingsDto): Promise<number> {
        const extraDays = settings.overdueExtraChargeDays ?? 0;
        const extraAmount = settings.overdueExtraChargeAmount ?? 0;
        const extraType = settings.overdueExtraChargeType ?? 'fixed';

        if (extraDays <= 0 || extraAmount <= 0) return 0;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lateFeeThreshold = new Date(startOfToday);
        lateFeeThreshold.setDate(lateFeeThreshold.getDate() - extraDays);

        const invoices = await Invoice.find({
            status: { $in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
            dueDate: { $lte: lateFeeThreshold },
        }).exec();

        let applied = 0;
        for (const inv of invoices) {
            const hasLateFee = inv.items?.some((i: any) => i.type === InvoiceItemType.LATE_FEE || i.meta?.isLateFee);
            if (hasLateFee) continue;

            const feeAmount = extraType === 'percent'
                ? Math.round((inv.balanceDue * extraAmount) / 100)
                : extraAmount;
            if (feeAmount <= 0) continue;

            inv.items = inv.items || [];
            inv.items.push({
                type: InvoiceItemType.LATE_FEE,
                description: `Late fee (${extraDays}+ days overdue)`,
                amount: feeAmount,
                meta: { isLateFee: true },
            });
            inv.subTotal = (inv.subTotal || 0) + feeAmount;
            inv.total = (inv.total || 0) + feeAmount;
            inv.balanceDue = (inv.balanceDue || 0) + feeAmount;
            await inv.save();

            try {
                const invoiceService = (await import('../../invoice/invoice.service')).default;
                await invoiceService.setInvoiceFxSnapshot(inv, {});
            } catch (fxErr: any) {
                logger.warn(`[InvoiceReminder] FX snapshot update failed for invoice ${inv._id}:`, fxErr?.message);
            }

            applied++;
            auditLogSafe({
                message: `Late fee ${feeAmount} ${inv.currency} applied to invoice ${inv.invoiceNumber}`,
                type: 'invoice_modified',
                category: 'invoice',
                actorType: 'system',
                source: 'cron',
                clientId: (inv.clientId as any)?.toString?.(),
                invoiceId: inv._id.toString(),
                meta: { lateFeeAmount: feeAmount, overdueExtraChargeDays: extraDays },
            });
        }

        if (applied > 0) {
            logger.info(`[InvoiceReminder] Applied late fee to ${applied} invoice(s).`);
        }
        return applied;
    }

    /**
     * Finds UNPAID invoices strictly matching due thresholds.
     */
    async processReminders() {
        const settings = await getBillingSettings();
        const lateFeesApplied = await this.applyLateFees(settings);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const overdueMarked = await this.markOverdueInvoices(startOfToday);

        const unpaidInvoices = await Invoice.find({
            status: { $in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] }
        })
            .populate({ path: 'clientId', select: 'contactEmail user', populate: { path: 'user', select: 'email' } })
            .lean()
            .exec();

        let remindersSent = 0;
        let sendFailedCount = 0;

        for (const invoice of unpaidInvoices) {
            const dueDate = new Date(invoice.dueDate);
            const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

            const diffTime = startOfToday.getTime() - startOfDueDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // negative = future, positive = overdue

            const reminderConfig = this.resolveReminder(diffDays, settings);
            if (!reminderConfig) continue;
            const reminderTargetType = reminderConfig.reminderType;
            const emailSubject = `${reminderConfig.emailSubject}: ${invoice.invoiceNumber}`;
            const emailTemplate = reminderConfig.emailTemplate;

            const existingLog = await InvoiceReminderLog.findOne({
                invoiceId: invoice._id,
                reminderType: reminderTargetType
            });

            if (!existingLog) {
                try {
                    const client = invoice.clientId as any;
                    const clientEmail = client?.contactEmail || client?.user?.email;
                    if (!clientEmail) {
                        logger.warn(`[InvoiceReminder] No email for invoice ${invoice._id}, skipping`);
                        continue;
                    }
                    const sent = await notificationProvider.sendEmail(
                        clientEmail,
                        emailSubject,
                        emailTemplate,
                        { invoice }
                    );

                    if (!sent) {
                        sendFailedCount++;
                    }

                    if (sent) {
                        await InvoiceReminderLog.create({
                            invoiceId: invoice._id,
                            reminderType: reminderTargetType
                        });
                        remindersSent++;
                        const client = invoice.clientId as any;
                        const clientName = client?.firstName || client?.lastName ? `${client?.firstName || ''} ${client?.lastName || ''}`.trim() : client?.contactEmail || 'Unknown';
                        const cid = (invoice.clientId as any)?._id ?? invoice.clientId;
                        auditLogSafe({
                            message: `Email sent to ${clientName} (${reminderTargetType})`,
                            type: 'email_sent',
                            category: 'email',
                            actorType: 'system',
                            source: 'cron',
                            clientId: cid?.toString?.(),
                            invoiceId: (invoice._id as any)?.toString?.(),
                            meta: { reminderType: reminderTargetType },
                        });
                    }
                } catch (err: any) {
                    if (err.code !== 11000) {
                        console.error(`Error sending reminder ${reminderTargetType} for Invoice ${invoice._id}:`, err);
                    }
                }
            }
        }

        if (sendFailedCount > 0) {
            logger.warn(`[InvoiceReminder] ${sendFailedCount} reminder(s) not sent (SMTP may be unconfigured). Will retry next run.`);
        }
        logger.info(`[InvoiceReminder] Sent ${remindersSent} invoice reminders.`);
        return { remindersSent, overdueMarked, lateFeesApplied };
    }
}

export default new InvoiceReminderScheduler();

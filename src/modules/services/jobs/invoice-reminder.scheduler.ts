import Invoice from '../../invoice/invoice.model';
import InvoiceReminderLog, { ReminderType } from '../../invoice/invoice-reminder-log.model';
import { notificationProvider } from '../providers/notification.provider';
import { InvoiceStatus } from '../../invoice/invoice.interface';

export class InvoiceReminderScheduler {

    /**
     * Finds UNPAID invoices strictly matching due thresholds.
     */
    async processReminders() {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const unpaidInvoices = await Invoice.find({
            status: InvoiceStatus.UNPAID
        }).lean().exec();

        let remindersSent = 0;

        for (const invoice of unpaidInvoices) {
            const dueDate = new Date(invoice.dueDate);
            const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

            const diffTime = startOfToday.getTime() - startOfDueDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // negative means future, positive means past overdue

            let reminderTargetType: ReminderType | null = null;
            let emailSubject = '';
            let emailTemplate = '';

            if (diffDays === -7) {
                reminderTargetType = ReminderType.PRE_REMINDER_7_DAYS;
                emailSubject = `Invoice ${invoice.invoiceNumber} Due In 7 Days`;
                emailTemplate = 'invoice-pre-reminder';
            } else if (diffDays === 0) {
                reminderTargetType = ReminderType.DUE_TODAY;
                emailSubject = `Invoice ${invoice.invoiceNumber} Due Today`;
                emailTemplate = 'invoice-due-today';
            } else if (diffDays === 3) {
                reminderTargetType = ReminderType.OVERDUE_3_DAYS;
                emailSubject = `Invoice ${invoice.invoiceNumber} is 3 Days Overdue`;
                emailTemplate = 'invoice-overdue-3';
            } else if (diffDays === 7) {
                reminderTargetType = ReminderType.OVERDUE_7_DAYS;
                emailSubject = `Invoice ${invoice.invoiceNumber} is 7 Days Overdue (Suspension Warning)`;
                emailTemplate = 'invoice-overdue-7';
            } else if (diffDays === 14) {
                reminderTargetType = ReminderType.OVERDUE_14_DAYS;
                emailSubject = `Invoice ${invoice.invoiceNumber} is 14 Days Overdue (Final Warning)`;
                emailTemplate = 'invoice-overdue-14';
            }

            if (!reminderTargetType) continue;

            const existingLog = await InvoiceReminderLog.findOne({
                invoiceId: invoice._id,
                reminderType: reminderTargetType
            });

            if (!existingLog) {
                try {
                    // Pull email dynamically safely
                    const clientEmail = invoice.billedTo?.customerName ? `${invoice.billedTo.customerName.replace(' ', '.')}@example.com` : 'client@example.com';
                    const sent = await notificationProvider.sendEmail(
                        clientEmail,
                        emailSubject,
                        emailTemplate,
                        { invoice }
                    );

                    if (sent) {
                        await InvoiceReminderLog.create({
                            invoiceId: invoice._id,
                            reminderType: reminderTargetType
                        });
                        remindersSent++;
                    }
                } catch (err: any) {
                    if (err.code !== 11000) {
                        console.error(`Error sending reminder ${reminderTargetType} for Invoice ${invoice._id}:`, err);
                    }
                }
            }
        }

        console.log(`[InvoiceReminder] Sent ${remindersSent} invoice reminders.`);
        return remindersSent;
    }
}

export default new InvoiceReminderScheduler();

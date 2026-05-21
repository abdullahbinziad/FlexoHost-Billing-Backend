import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';
import type { OverdueReminderProps } from './overdue-reminder';

type ReminderTone = 'info' | 'warning' | 'error';

function buildReminderTemplate(config: {
    key: BaseEmailTemplate<OverdueReminderProps>['key'];
    subject: (p: OverdueReminderProps) => string;
    preview: (p: OverdueReminderProps) => string;
    title: string;
    alert: (p: OverdueReminderProps) => string;
    tone: ReminderTone;
    ctaLabel: string;
}): BaseEmailTemplate<OverdueReminderProps> {
    return {
        key: config.key,
        category: 'billing',
        buildSubject: config.subject,
        previewText: config.preview,
        renderHtml: (props) => {
            const dueLabel =
                props.overdueDays < 0
                    ? `Due in ${Math.abs(props.overdueDays)} day${Math.abs(props.overdueDays) === 1 ? '' : 's'}`
                    : props.overdueDays === 0
                        ? 'Due today'
                        : `${props.overdueDays} day${props.overdueDays === 1 ? '' : 's'} overdue`;
            const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({ message: config.alert(props), variant: config.tone })}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Invoice Number', value: props.invoiceNumber },
        { label: 'Due Date', value: props.originalDueDate },
        { label: 'Status', value: dueLabel },
        { label: 'Amount Due', value: `${props.currency} ${props.amountDue}` },
      ],
      title: config.title,
  })}
  ${renderCTAButton({ href: props.paymentUrl, label: config.ctaLabel })}
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
            return renderDefaultLayout({ ...props, content });
        },
        renderText: (props) =>
            htmlToPlainText(
                `${config.subject(props)}. Invoice: ${props.invoiceNumber}. Due date: ${props.originalDueDate}. Amount: ${props.currency} ${props.amountDue}. Pay: ${props.paymentUrl}. Support: ${props.supportEmail}`
            ),
    };
}

export const invoiceDueSoonTemplate = buildReminderTemplate({
    key: 'billing.invoice_due_soon',
    subject: (p) => `Invoice ${p.invoiceNumber} Due Soon`,
    preview: (p) => `Your invoice ${p.invoiceNumber} is due soon. Amount due: ${p.currency} ${p.amountDue}.`,
    title: 'Upcoming Invoice',
    alert: (p) => `Your invoice is due in ${Math.abs(p.overdueDays)} day${Math.abs(p.overdueDays) === 1 ? '' : 's'}. Please pay before the due date to avoid interruption.`,
    tone: 'info',
    ctaLabel: 'Pay Invoice',
});

export const invoiceDueTodayTemplate = buildReminderTemplate({
    key: 'billing.invoice_due_today',
    subject: (p) => `Invoice ${p.invoiceNumber} Due Today`,
    preview: (p) => `Your invoice ${p.invoiceNumber} is due today. Amount due: ${p.currency} ${p.amountDue}.`,
    title: 'Invoice Due Today',
    alert: () => 'Your invoice is due today. Please complete payment today to keep services active.',
    tone: 'warning',
    ctaLabel: 'Pay Now',
});

export const invoiceOverdueFirstTemplate = buildReminderTemplate({
    key: 'billing.invoice_overdue_first',
    subject: (p) => `First Reminder - Invoice ${p.invoiceNumber} Overdue`,
    preview: (p) => `Invoice ${p.invoiceNumber} is overdue. Please pay ${p.currency} ${p.amountDue}.`,
    title: 'First Overdue Reminder',
    alert: (p) => `This is a friendly reminder that your invoice is ${p.overdueDays} day${p.overdueDays === 1 ? '' : 's'} overdue.`,
    tone: 'warning',
    ctaLabel: 'Pay Now',
});

export const invoiceOverdueSecondTemplate = buildReminderTemplate({
    key: 'billing.invoice_overdue_second',
    subject: (p) => `Second Reminder - Invoice ${p.invoiceNumber} Overdue`,
    preview: (p) => `Invoice ${p.invoiceNumber} is still unpaid. Pay now to avoid service impact.`,
    title: 'Second Overdue Reminder',
    alert: (p) => `Your invoice remains unpaid after ${p.overdueDays} day${p.overdueDays === 1 ? '' : 's'}. Please pay now to avoid service suspension.`,
    tone: 'warning',
    ctaLabel: 'Pay Now',
});

export const invoiceOverdueFinalTemplate = buildReminderTemplate({
    key: 'billing.invoice_overdue_final',
    subject: (p) => `Final Reminder - Invoice ${p.invoiceNumber}`,
    preview: (p) => `Final reminder: pay invoice ${p.invoiceNumber} to avoid service suspension or termination.`,
    title: 'Final Billing Reminder',
    alert: () => 'This is a final billing reminder. If payment is not received, related services may be suspended or terminated according to your billing policy.',
    tone: 'error',
    ctaLabel: 'Pay Now',
});

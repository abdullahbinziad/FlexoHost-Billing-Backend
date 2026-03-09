/**
 * billing.overdue_reminder - Encourage payment before suspension
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface OverdueReminderProps {
    customerName: string;
    invoiceNumber: string;
    originalDueDate: string;
    overdueDays: number;
    amountDue: string;
    currency: string;
    paymentUrl: string;
}

export const overdueReminderTemplate: BaseEmailTemplate<OverdueReminderProps> = {
    key: 'billing.overdue_reminder',
    category: 'billing',

    buildSubject: (p) =>
        p.overdueDays > 0
            ? `Invoice ${p.invoiceNumber} is ${p.overdueDays} day${p.overdueDays > 1 ? 's' : ''} overdue`
            : p.overdueDays === 0
                ? `Invoice ${p.invoiceNumber} Due Today`
                : `Invoice ${p.invoiceNumber} Due In ${Math.abs(p.overdueDays)} Days`,

    previewText: (p) =>
        p.overdueDays > 0
            ? `Your invoice ${p.invoiceNumber} is overdue. Amount due: ${p.currency} ${p.amountDue}. Pay now to avoid suspension.`
            : `Your invoice ${p.invoiceNumber} requires payment. Amount due: ${p.currency} ${p.amountDue}.`,

    renderHtml: (props) => {
        const isOverdue = props.overdueDays > 0;
        const alertMsg = isOverdue
            ? `Your invoice is ${props.overdueDays} day${props.overdueDays > 1 ? 's' : ''} overdue. Please pay immediately to avoid service suspension.`
            : props.overdueDays === 0
                ? 'Your invoice is due today. Please pay to avoid service suspension.'
                : `Your invoice is due in ${Math.abs(props.overdueDays)} days. Please ensure payment is made by the due date.`;

        const daysRow = isOverdue
            ? { label: 'Days Overdue', value: `${props.overdueDays} day${props.overdueDays > 1 ? 's' : ''}` }
            : { label: 'Due', value: props.overdueDays === 0 ? 'Today' : `In ${Math.abs(props.overdueDays)} days` };

        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({ message: alertMsg, variant: isOverdue ? 'warning' : 'info' })}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Invoice Number', value: props.invoiceNumber },
        { label: 'Original Due Date', value: props.originalDueDate },
        daysRow,
        { label: 'Amount Due', value: `${props.currency} ${props.amountDue}` },
      ],
      title: isOverdue ? 'Overdue Invoice' : 'Invoice Reminder',
  })}
  ${renderCTAButton({ href: props.paymentUrl, label: 'Pay Now' })}
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Invoice ${props.invoiceNumber} is ${props.overdueDays} days overdue. Amount due: ${props.currency} ${props.amountDue}. Pay: ${props.paymentUrl}. Support: ${props.supportEmail}`
        ),
};

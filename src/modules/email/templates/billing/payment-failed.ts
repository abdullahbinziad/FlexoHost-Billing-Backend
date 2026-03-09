/**
 * billing.payment_failed - Failed payment notification
 * Tone: clear, calm, urgent but not aggressive
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface PaymentFailedProps {
    customerName: string;
    invoiceNumber: string;
    amountDue: string;
    currency: string;
    dueDate: string;
    retryPaymentUrl: string;
    billingUrl: string;
    serviceName?: string;
}

export const paymentFailedTemplate: BaseEmailTemplate<PaymentFailedProps> = {
    key: 'billing.payment_failed',
    category: 'billing',

    buildSubject: (p) => `Payment Failed - Invoice ${p.invoiceNumber}`,

    previewText: (p) => `Your payment of ${p.currency} ${p.amountDue} could not be processed. Please update your payment method.`,

    renderHtml: (props) => {
        const affectedService = props.serviceName
            ? ` This affects your ${props.serviceName} service.`
            : '';

        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: `Your recent payment attempt could not be processed.${affectedService} Please update your payment method and try again to avoid possible service interruption.`,
    variant: 'error',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Invoice Number', value: props.invoiceNumber },
        { label: 'Amount Due', value: `${props.currency} ${props.amountDue}` },
        { label: 'Due Date', value: props.dueDate },
      ],
      title: 'Affected Invoice',
  })}
  <p style="margin:16px 0;">To avoid service interruption, please retry your payment or update your payment method before the due date.</p>
  ${renderCTAButton({ href: props.retryPaymentUrl, label: 'Retry Payment / Update Method' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.billingUrl}" style="color:#3a9cfd; text-decoration:none;">Go to Billing Portal</a>
  </p>
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Payment failed for Invoice ${props.invoiceNumber}. Amount: ${props.currency} ${props.amountDue}. Due: ${props.dueDate}. Retry: ${props.retryPaymentUrl}. Support: ${props.supportEmail}`
        ),
};

/**
 * billing.payment_success - Payment receipt email
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderStatusBadge, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface PaymentSuccessProps {
    customerName: string;
    invoiceNumber: string;
    transactionId: string;
    amountPaid: string;
    currency: string;
    paymentDate: string;
    paymentMethodLabel: string;
    billingUrl: string;
}

export const paymentSuccessTemplate: BaseEmailTemplate<PaymentSuccessProps> = {
    key: 'billing.payment_success',
    category: 'billing',

    buildSubject: (p) => `Payment Received - Invoice ${p.invoiceNumber}`,

    previewText: (p) => `Thank you! We have received your payment of ${p.currency} ${p.amountPaid}.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">Thank you for your payment. We have successfully received and processed it. ${renderStatusBadge({ status: 'Paid', variant: 'success' })}</p>
  ${renderInfoTable({
      rows: [
        { label: 'Invoice Number', value: props.invoiceNumber },
        { label: 'Transaction ID', value: props.transactionId },
        { label: 'Amount Paid', value: `${props.currency} ${props.amountPaid}` },
        { label: 'Payment Date', value: props.paymentDate },
        { label: 'Payment Method', value: props.paymentMethodLabel },
      ],
      title: 'Payment Details',
  })}
  ${renderCTAButton({ href: props.billingUrl, label: 'View Billing Area' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">If you have any questions about this payment, our support team is happy to help.</p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Thank you for your payment!\n\nInvoice: ${props.invoiceNumber}\nTransaction ID: ${props.transactionId}\nAmount: ${props.currency} ${props.amountPaid}\nDate: ${props.paymentDate}\nMethod: ${props.paymentMethodLabel}\n\nBilling: ${props.billingUrl}`
        ),
};

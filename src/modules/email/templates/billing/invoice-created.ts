/**
 * billing.invoice_created - Notify customer that a new invoice has been generated
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderCTAButton, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface InvoiceLineItem {
    label: string;
    amount: string;
}

export interface InvoiceCreatedProps {
    customerName: string;
    invoiceNumber: string;
    dueDate: string;
    amountDue: string;
    currency: string;
    invoiceUrl: string;
    billingUrl: string;
    lineItems: InvoiceLineItem[];
}

export const invoiceCreatedTemplate: BaseEmailTemplate<InvoiceCreatedProps> = {
    key: 'billing.invoice_created',
    category: 'billing',

    buildSubject: (p) => `Invoice ${p.invoiceNumber} Created`,

    previewText: (p) => `A new invoice has been created. Amount due: ${p.currency} ${p.amountDue}`,

    renderHtml: (props) => {
        const lineItemsRows = props.lineItems.map(
            (item) => `
  <tr>
    <td style="padding:8px 12px; font-size:14px; color:#1f2937; border-bottom:1px solid #f3f4f6;">${item.label}</td>
    <td style="padding:8px 12px; font-size:14px; color:#1f2937; font-weight:500; text-align:right; border-bottom:1px solid #f3f4f6;">${props.currency} ${item.amount}</td>
  </tr>`
        ).join('');

        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">A new invoice has been generated for your account.</p>
  ${renderInfoTable({
      rows: [
        { label: 'Invoice Number', value: props.invoiceNumber },
        { label: 'Due Date', value: props.dueDate },
        { label: 'Amount Due', value: `${props.currency} ${props.amountDue}` },
      ],
      title: 'Invoice Details',
  })}
  ${props.lineItems.length > 0 ? `
  <p style="margin:16px 0 8px; font-size:14px; font-weight:600; color:#374151;">Service Summary</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-info-table" style="margin:0 0 16px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
    <tr style="background-color:#f9fafb;">
      <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#374151;">Description</td>
      <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#374151; text-align:right;">Amount</td>
    </tr>
    ${lineItemsRows}
  </table>
  ` : ''}
  ${renderAlertBox({
      message: `If this invoice remains unpaid by the due date, your services may be affected. Please pay before ${props.dueDate} to avoid any interruption.`,
      variant: 'warning',
  })}
  ${renderCTAButton({ href: props.invoiceUrl, label: 'Pay Now' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.billingUrl}" style="color:#3a9cfd; text-decoration:none;">View Billing Portal</a>
  </p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) => {
        const itemsText = props.lineItems.length > 0
            ? props.lineItems.map((i) => `  - ${i.label}: ${props.currency} ${i.amount}`).join('\n')
            : '';
        return htmlToPlainText(
            `Invoice ${props.invoiceNumber} created. Due ${props.dueDate}. Amount due: ${props.currency} ${props.amountDue}.${itemsText ? `\nItems:\n${itemsText}` : ''}\n\nPay: ${props.invoiceUrl}\nBilling: ${props.billingUrl}`
        );
    },
};

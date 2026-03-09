/**
 * order.confirmation - Hosting/domain/VPS order confirmation
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderCTAButton, renderStatusBadge, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface OrderItem {
    name: string;
    type: string;
    billingCycle: string;
    quantity: number;
    price: string;
}

export interface OrderConfirmationProps {
    customerName: string;
    orderNumber: string;
    orderDate: string;
    items: OrderItem[];
    subtotal: string;
    tax: string;
    total: string;
    currency: string;
    paymentStatus: string;
    clientAreaUrl: string;
    supportUrl: string;
}

export const orderConfirmationTemplate: BaseEmailTemplate<OrderConfirmationProps> = {
    key: 'order.confirmation',
    category: 'order',

    buildSubject: (p) => `Order Confirmed - #${p.orderNumber}`,

    previewText: (p) => `Your order #${p.orderNumber} has been confirmed. Total: ${p.currency} ${p.total}`,

    renderHtml: (props) => {
        const itemsRows = props.items.map(
            (item) =>
                `<tr>
          <td style="padding:8px 12px; font-size:14px; color:#1f2937; border-bottom:1px solid #f3f4f6;">${item.name}</td>
          <td style="padding:8px 12px; font-size:14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">${item.type}</td>
          <td style="padding:8px 12px; font-size:14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">${item.billingCycle}</td>
          <td style="padding:8px 12px; font-size:14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">${item.quantity}</td>
          <td style="padding:8px 12px; font-size:14px; color:#1f2937; font-weight:500; border-bottom:1px solid #f3f4f6;">${props.currency} ${item.price}</td>
        </tr>`
        ).join('');

        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">Thank you for your order. We've received your payment and your order is being processed.</p>
  ${renderInfoTable({
      rows: [
        { label: 'Order Number', value: props.orderNumber },
        { label: 'Order Date', value: props.orderDate },
        { label: 'Payment Status', value: renderStatusBadge({ status: props.paymentStatus, variant: 'success' }) },
      ],
      title: 'Order Details',
  })}
  <p style="margin:16px 0 8px; font-size:14px; font-weight:600; color:#374151;">Order Items</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="email-order-table email-info-table" style="margin:0 0 16px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
    <tr style="background-color:#f9fafb;">
      <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#374151;">Item</td>
      <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#374151;">Type</td>
      <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#374151;">Billing</td>
      <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#374151;">Qty</td>
      <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#374151;">Price</td>
    </tr>
    ${itemsRows}
  </table>
  ${renderInfoTable({
      rows: [
        { label: 'Subtotal', value: `${props.currency} ${props.subtotal}` },
        { label: 'Tax', value: `${props.currency} ${props.tax}` },
        { label: 'Total', value: `${props.currency} ${props.total}` },
      ],
      title: 'Billing Summary',
  })}
  <p style="margin:16px 0;">Your services will be provisioned shortly. You can track your order in your dashboard.</p>
  ${renderCTAButton({ href: props.clientAreaUrl, label: 'Go to Dashboard' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.supportUrl}" style="color:#3a9cfd; text-decoration:none;">Contact Support</a>
  </p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) => {
        const itemsText = props.items
            .map((i) => `  - ${i.name} (${i.type}, ${i.billingCycle}) x${i.quantity}: ${props.currency} ${i.price}`)
            .join('\n');
        return htmlToPlainText(
            `Order #${props.orderNumber} confirmed. Total: ${props.currency} ${props.total}. Items:\n${itemsText}\n\nDashboard: ${props.clientAreaUrl}. Support: ${props.supportUrl}`
        );
    },
};

/**
 * service.suspension_warning - Service may be suspended due to unpaid invoice
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface SuspensionWarningProps {
    customerName: string;
    serviceName: string;
    serviceIdentifier: string;
    reason: string;
    suspensionDate: string;
    paymentUrl: string;
    billingUrl: string;
}

export const suspensionWarningTemplate: BaseEmailTemplate<SuspensionWarningProps> = {
    key: 'service.suspension_warning',
    category: 'service',

    buildSubject: (p) => `Suspension Warning - ${p.serviceName}`,

    previewText: (p) => `Your service may be suspended on ${p.suspensionDate}. Pay now to avoid interruption.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: `Your service may be suspended due to an unpaid invoice. If payment is not received by ${props.suspensionDate}, your service will be interrupted.`,
    variant: 'warning',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Service', value: props.serviceName },
        { label: 'Service ID', value: props.serviceIdentifier },
        { label: 'Reason', value: props.reason },
        { label: 'Suspension Deadline', value: props.suspensionDate },
      ],
      title: 'Affected Service',
  })}
  <p style="margin:16px 0;">To avoid service interruption, please pay the outstanding balance before the deadline.</p>
  ${renderCTAButton({ href: props.paymentUrl, label: 'Pay Now' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.billingUrl}" style="color:#3a9cfd; text-decoration:none;">View Billing Portal</a>
  </p>
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Suspension warning: ${props.serviceName} (${props.serviceIdentifier}). Reason: ${props.reason}. Deadline: ${props.suspensionDate}. Pay: ${props.paymentUrl}. Support: ${props.supportEmail}`
        ),
};

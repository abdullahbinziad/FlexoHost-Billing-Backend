/**
 * service.suspended - Service has been suspended
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface SuspendedProps {
    customerName: string;
    serviceName: string;
    serviceIdentifier: string;
    suspensionReason: string;
    restoreActionUrl: string;
    supportUrl: string;
}

export const suspendedTemplate: BaseEmailTemplate<SuspendedProps> = {
    key: 'service.suspended',
    category: 'service',

    buildSubject: (p) => `Service Suspended - ${p.serviceName}`,

    previewText: (p) => `Your service ${p.serviceName} has been suspended. Take action to restore.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: 'Your service has been suspended. Please take the required action below to restore access.',
    variant: 'error',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Service', value: props.serviceName },
        { label: 'Service ID', value: props.serviceIdentifier },
        { label: 'Reason', value: props.suspensionReason },
      ],
      title: 'Suspended Service',
  })}
  <p style="margin:16px 0;">To restore your service, complete the required action (e.g. pay outstanding balance or resolve compliance issue).</p>
  ${renderCTAButton({ href: props.restoreActionUrl, label: 'Restore Service' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.restoreActionUrl}" style="color:#3a9cfd; text-decoration:none;">Billing / Restore Action</a>
    &nbsp;|&nbsp;
    <a href="${props.supportUrl}" style="color:#3a9cfd; text-decoration:none;">Contact Support</a>
  </p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Service suspended: ${props.serviceName} (${props.serviceIdentifier}). Reason: ${props.suspensionReason}. Restore: ${props.restoreActionUrl}. Support: ${props.supportUrl}`
        ),
};

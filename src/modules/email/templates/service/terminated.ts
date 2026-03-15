/**
 * service.terminated - Service has been terminated
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface TerminatedProps {
    customerName: string;
    serviceName: string;
    serviceIdentifier: string;
    terminationReason: string;
    restoreInfoUrl: string;
    supportUrl: string;
}

export const terminatedTemplate: BaseEmailTemplate<TerminatedProps> = {
    key: 'service.terminated',
    category: 'service',

    buildSubject: (p) => `Service Terminated - ${p.serviceName}`,

    previewText: (p) => `Your service ${p.serviceName} has been terminated. Contact support if you need to restore.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: 'Your service has been terminated due to prolonged non-payment. Data may have been removed. If you wish to restore service, please contact support.',
    variant: 'error',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Service', value: props.serviceName },
        { label: 'Service ID', value: props.serviceIdentifier },
        { label: 'Reason', value: props.terminationReason },
      ],
      title: 'Terminated Service',
  })}
  <p style="margin:16px 0;">If you believe this was an error or wish to restore your service, please contact our support team.</p>
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.restoreInfoUrl}" style="color:#3a9cfd; text-decoration:none;">Billing Portal</a>
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
            `Service terminated: ${props.serviceName} (${props.serviceIdentifier}). Reason: ${props.terminationReason}. Contact support: ${props.supportUrl}`
        ),
};

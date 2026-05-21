import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface UnsuspendedProps {
    customerName: string;
    serviceName: string;
    serviceIdentifier: string;
    restoredAt: string;
    manageServiceUrl: string;
    supportUrl: string;
}

export const unsuspendedTemplate: BaseEmailTemplate<UnsuspendedProps> = {
    key: 'service.unsuspended',
    category: 'service',
    buildSubject: (p) => `Service Restored - ${p.serviceName}`,
    previewText: (p) => `Your service ${p.serviceName} has been restored and is active again.`,
    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({ message: 'Your service has been restored and is active again.', variant: 'success' })}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Service', value: props.serviceName },
        { label: 'Service ID', value: props.serviceIdentifier },
        { label: 'Restored At', value: props.restoredAt },
      ],
      title: 'Restored Service',
  })}
  ${renderCTAButton({ href: props.manageServiceUrl, label: 'Manage Service' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.supportUrl}" style="color:#3a9cfd; text-decoration:none;">Contact Support</a>
  </p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },
    renderText: (props) =>
        htmlToPlainText(
            `Service restored: ${props.serviceName} (${props.serviceIdentifier}). Restored at: ${props.restoredAt}. Manage: ${props.manageServiceUrl}. Support: ${props.supportUrl}`
        ),
};

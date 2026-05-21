import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface DomainRenewalFailedProps {
    customerName: string;
    domain: string;
    expirationDate: string;
    invoiceNumber?: string;
    supportUrl: string;
}

export const domainRenewalFailedTemplate: BaseEmailTemplate<DomainRenewalFailedProps> = {
    key: 'domain.renewal_failed',
    category: 'domain',
    buildSubject: (p) => `Domain Renewal Needs Attention - ${p.domain}`,
    previewText: (p) => `We could not complete automatic renewal for ${p.domain}. Our team will review it.`,
    renderHtml: (props) => {
        const rows = [
            { label: 'Domain', value: props.domain },
            { label: 'Current Expiration', value: props.expirationDate },
        ];
        if (props.invoiceNumber) rows.push({ label: 'Invoice', value: props.invoiceNumber });
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: 'We could not complete the automatic registrar renewal. Our team has been notified and will review this manually.',
    variant: 'warning',
})}
${renderSectionCard(`
  ${renderInfoTable({ rows, title: 'Domain Renewal Status' })}
  <p style="margin:16px 0;">No action may be required from you if payment is already completed. If we need additional information, our support team will contact you.</p>
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
            `Domain renewal needs attention: ${props.domain}. Expiration: ${props.expirationDate}. Support: ${props.supportUrl}`
        ),
};

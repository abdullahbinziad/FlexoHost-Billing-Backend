import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface DomainRenewalSuccessProps {
    customerName: string;
    domain: string;
    previousExpirationDate: string;
    newExpirationDate: string;
    manageDomainUrl: string;
}

export const domainRenewalSuccessTemplate: BaseEmailTemplate<DomainRenewalSuccessProps> = {
    key: 'domain.renewal_success',
    category: 'domain',
    buildSubject: (p) => `Domain Renewed - ${p.domain}`,
    previewText: (p) => `Your domain ${p.domain} has been renewed until ${p.newExpirationDate}.`,
    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({ message: `Your domain ${props.domain} has been renewed successfully.`, variant: 'success' })}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Domain', value: props.domain },
        { label: 'Previous Expiration', value: props.previousExpirationDate },
        { label: 'New Expiration', value: props.newExpirationDate },
      ],
      title: 'Domain Renewal',
  })}
  ${renderCTAButton({ href: props.manageDomainUrl, label: 'Manage Domain' })}
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },
    renderText: (props) =>
        htmlToPlainText(
            `Domain renewed: ${props.domain}. Previous expiration: ${props.previousExpirationDate}. New expiration: ${props.newExpirationDate}. Manage: ${props.manageDomainUrl}`
        ),
};

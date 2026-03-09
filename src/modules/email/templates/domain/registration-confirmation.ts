/**
 * domain.registration_confirmation - Domain successfully registered
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderCTAButton, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface DomainRegistrationConfirmationProps {
    customerName: string;
    domain: string;
    registrationPeriod: string;
    registrationDate: string;
    autoRenewEnabled: boolean;
    manageDomainUrl: string;
}

export const domainRegistrationConfirmationTemplate: BaseEmailTemplate<DomainRegistrationConfirmationProps> = {
    key: 'domain.registration_confirmation',
    category: 'domain',

    buildSubject: (p) => `Domain Registered - ${p.domain}`,

    previewText: (p) => `Your domain ${p.domain} has been successfully registered.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">Your domain has been successfully registered.</p>
  ${renderInfoTable({
      rows: [
        { label: 'Domain', value: props.domain },
        { label: 'Registration Period', value: props.registrationPeriod },
        { label: 'Registration Date', value: props.registrationDate },
        { label: 'Auto-Renew', value: props.autoRenewEnabled ? 'Enabled' : 'Disabled' },
      ],
      title: 'Domain Details',
  })}
  ${renderCTAButton({ href: props.manageDomainUrl, label: 'Manage Domain' })}
  ${renderAlertBox({
      message: 'DNS changes may take up to 48 hours to propagate globally. If your domain does not resolve immediately, please wait and try again.',
      variant: 'info',
  })}
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Domain ${props.domain} registered. Period: ${props.registrationPeriod}. Date: ${props.registrationDate}. Auto-renew: ${props.autoRenewEnabled ? 'Yes' : 'No'}. Manage: ${props.manageDomainUrl}. DNS propagation may take up to 48 hours. Support: ${props.supportEmail}`
        ),
};

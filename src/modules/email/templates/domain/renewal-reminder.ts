/**
 * domain.renewal_reminder - Domain renewal reminder
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface DomainRenewalReminderProps {
    customerName: string;
    domain: string;
    expirationDate: string;
    daysRemaining: number;
    renewalPrice: string;
    currency: string;
    autoRenewEnabled: boolean;
    renewUrl: string;
}

export const domainRenewalReminderTemplate: BaseEmailTemplate<DomainRenewalReminderProps> = {
    key: 'domain.renewal_reminder',
    category: 'domain',

    buildSubject: (p) => `Domain Renewal Reminder - ${p.domain}`,

    previewText: (p) => `Your domain ${p.domain} expires in ${p.daysRemaining} days. Renew now to avoid losing it.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: `Your domain ${props.domain} will expire in ${props.daysRemaining} days. If it expires, you may lose the domain and your website/email could go offline. Renew now to avoid this risk.`,
    variant: props.daysRemaining <= 7 ? 'warning' : 'info',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Domain', value: props.domain },
        { label: 'Expiration Date', value: props.expirationDate },
        { label: 'Days Remaining', value: `${props.daysRemaining} day${props.daysRemaining !== 1 ? 's' : ''}` },
        { label: 'Renewal Price', value: `${props.currency} ${props.renewalPrice}` },
        { label: 'Auto-Renew', value: props.autoRenewEnabled ? 'Enabled' : 'Disabled' },
      ],
      title: 'Domain Details',
  })}
  ${renderCTAButton({ href: props.renewUrl, label: 'Renew Now' })}
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Domain ${props.domain} expires in ${props.daysRemaining} days. Expiration: ${props.expirationDate}. Price: ${props.currency} ${props.renewalPrice}. Auto-renew: ${props.autoRenewEnabled ? 'Yes' : 'No'}. Renew: ${props.renewUrl}. Support: ${props.supportEmail}`
        ),
};

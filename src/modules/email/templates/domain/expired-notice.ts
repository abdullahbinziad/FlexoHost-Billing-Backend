/**
 * domain.expired_notice - Domain has expired
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface DomainExpiredNoticeProps {
    customerName: string;
    domain: string;
    expirationDate: string;
    statusLabel: string;
    restoreUrl: string;
}

export const domainExpiredNoticeTemplate: BaseEmailTemplate<DomainExpiredNoticeProps> = {
    key: 'domain.expired_notice',
    category: 'domain',

    buildSubject: (p) => `Domain Expired - ${p.domain}`,

    previewText: (p) => `Your domain ${p.domain} has expired. Restore it before it's released.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: `Your domain ${props.domain} has expired. Your website and email associated with this domain may be experiencing downtime. You have a limited grace period to restore it before it becomes available for registration by others.`,
    variant: 'error',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Domain', value: props.domain },
        { label: 'Expiration Date', value: props.expirationDate },
        { label: 'Current Status', value: props.statusLabel },
      ],
      title: 'Domain Details',
  })}
  <p style="margin:16px 0;">Restore your domain now to avoid losing it and to bring your website and email back online.</p>
  ${renderCTAButton({ href: props.restoreUrl, label: 'Restore Domain' })}
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Domain ${props.domain} has expired. Status: ${props.statusLabel}. Expiration: ${props.expirationDate}. Your website/email may be down. Restore: ${props.restoreUrl}. Support: ${props.supportEmail}`
        ),
};

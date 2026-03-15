/**
 * service.termination_warning - Service will be terminated soon (suspended for X days)
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface TerminationWarningProps {
    customerName: string;
    serviceName: string;
    serviceIdentifier: string;
    terminationReason: string;
    daysRemaining: number;
    terminationDate: string;
    restoreActionUrl: string;
    supportUrl: string;
}

export const terminationWarningTemplate: BaseEmailTemplate<TerminationWarningProps> = {
    key: 'service.termination_warning',
    category: 'service',

    buildSubject: (p) => `Service Termination Warning - ${p.serviceName} (${p.daysRemaining} days remaining)`,

    previewText: (p) => `Your service ${p.serviceName} will be terminated in ${p.daysRemaining} day(s). Pay now to restore.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: `Your suspended service will be permanently terminated in ${props.daysRemaining} day(s). Pay your outstanding balance now to restore your service and avoid data loss.`,
    variant: 'error',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Service', value: props.serviceName },
        { label: 'Service ID', value: props.serviceIdentifier },
        { label: 'Reason', value: props.terminationReason },
        { label: 'Termination Date', value: props.terminationDate },
        { label: 'Days Remaining', value: String(props.daysRemaining) },
      ],
      title: 'Suspended Service',
  })}
  <p style="margin:16px 0;">To restore your service, pay your outstanding balance before the termination date.</p>
  ${renderCTAButton({ href: props.restoreActionUrl, label: 'Pay Now & Restore' })}
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.restoreActionUrl}" style="color:#3a9cfd; text-decoration:none;">Billing / Pay Invoice</a>
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
            `Termination warning: ${props.serviceName} (${props.serviceIdentifier}). ${props.daysRemaining} days remaining. Terminates: ${props.terminationDate}. Pay: ${props.restoreActionUrl}. Support: ${props.supportUrl}`
        ),
};

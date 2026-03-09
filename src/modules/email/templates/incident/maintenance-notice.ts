/**
 * incident.maintenance_notice - Scheduled maintenance notice
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface MaintenanceNoticeProps {
    customerName: string;
    affectedService: string;
    maintenanceStart: string;
    maintenanceEnd: string;
    expectedDuration: string;
    impactSummary: string;
    statusPageUrl: string;
    supportUrl: string;
}

export const maintenanceNoticeTemplate: BaseEmailTemplate<MaintenanceNoticeProps> = {
    key: 'incident.maintenance_notice',
    category: 'incident',

    buildSubject: (p) => `Scheduled Maintenance - ${p.affectedService}`,

    previewText: (p) => `Planned maintenance on ${p.affectedService}: ${p.maintenanceStart} - ${p.maintenanceEnd}.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: 'We are performing scheduled maintenance to improve our services. Your data is safe and will not be affected. We recommend planning for brief service unavailability during the maintenance window.',
    variant: 'info',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Service/System', value: props.affectedService },
        { label: 'Start Time', value: props.maintenanceStart },
        { label: 'End Time', value: props.maintenanceEnd },
        { label: 'Expected Duration', value: props.expectedDuration },
      ],
      title: 'Maintenance Window',
  })}
  <p style="margin:16px 0 8px; font-size:14px; font-weight:600; color:#374151;">What may be impacted</p>
  <p style="margin:0 0 16px; font-size:14px; color:#4b5563;">${props.impactSummary}</p>
  <p style="margin:0 0 16px; font-size:14px; color:#4b5563;">Your data is stored securely and will not be modified during this maintenance. We will notify you when the maintenance is complete.</p>
  ${renderCTAButton({ href: props.statusPageUrl, label: 'View Status Page' })}
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
            `Scheduled maintenance: ${props.affectedService}. ${props.maintenanceStart} - ${props.maintenanceEnd} (${props.expectedDuration}). Impact: ${props.impactSummary}. Your data is safe. Status: ${props.statusPageUrl}. Support: ${props.supportUrl}`
        ),
};

/**
 * service.hosting_ready - Shared hosting account activation
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderCTAButton, renderStatusBadge, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface HostingReadyProps {
    customerName: string;
    domain: string;
    serverHostname: string;
    nameservers: string[];
    controlPanelUrl: string;
    username: string;
    setupPasswordUrl: string;
    gettingStartedUrl: string;
    supportUrl: string;
}

export const hostingReadyTemplate: BaseEmailTemplate<HostingReadyProps> = {
    key: 'service.hosting_ready',
    category: 'service',

    buildSubject: (p) => `Your hosting account is ready - ${p.domain}`,

    previewText: (p) => `Your hosting account for ${p.domain} is now active. Use the secure link to set your password and get started.`,

    renderHtml: (props) => {
        const nameserversList = props.nameservers
            .map((ns) => `<li style="margin:4px 0; font-family:monospace; font-size:13px;">${ns}</li>`)
            .join('');

        const rows: { label: string; value: string }[] = [
            { label: 'Domain', value: props.domain },
            { label: 'Server Hostname', value: props.serverHostname },
            { label: 'Username', value: props.username },
            { label: 'Status', value: renderStatusBadge({ status: 'Active', variant: 'success' }) },
        ];

        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">Great news! Your shared hosting account is now active and ready to use.</p>
  ${renderInfoTable({ rows, title: 'Account Details' })}
  ${props.nameservers.length > 0 ? `
  <p style="margin:16px 0 8px; font-size:14px; font-weight:600; color:#374151;">Nameservers</p>
  <p style="margin:0 0 16px; font-size:14px; color:#4b5563;">Point your domain to these nameservers (DNS propagation may take up to 48 hours):</p>
  <ul style="margin:0 0 16px; padding-left:20px; font-size:14px; color:#1f2937;">
    ${nameserversList}
  </ul>
  ` : ''}
  ${renderAlertBox({
      message: 'For security, we do not send passwords by email. Use the secure link below to set your password and log in.',
      variant: 'info',
  })}
  ${renderCTAButton({ href: props.setupPasswordUrl, label: 'Set Up Password & Log In' })}
  <p style="margin:24px 0 0; font-size:14px; font-weight:600; color:#374151;">Getting Started Tips</p>
  <ul style="margin:8px 0 16px; padding-left:20px; font-size:14px; color:#4b5563; line-height:1.6;">
    <li>Set your password using the link above</li>
    <li>Access your control panel to manage files, databases, and email</li>
    <li>Check our getting started guide for step-by-step instructions</li>
  </ul>
  <p style="margin:16px 0 0; font-size:14px; color:#4b5563;">
    <a href="${props.controlPanelUrl}" style="color:#3a9cfd; text-decoration:none;">Control Panel</a>
    &nbsp;|&nbsp;
    <a href="${props.gettingStartedUrl}" style="color:#3a9cfd; text-decoration:none;">Getting Started Guide</a>
    &nbsp;|&nbsp;
    <a href="${props.supportUrl}" style="color:#3a9cfd; text-decoration:none;">Support</a>
  </p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) => {
        const nsText = props.nameservers.length > 0
            ? `\nNameservers:\n${props.nameservers.map((n) => `  - ${n}`).join('\n')}`
            : '';
        return htmlToPlainText(
            `Your hosting for ${props.domain} is ready.\n\nServer: ${props.serverHostname}\nUsername: ${props.username}${nsText}\n\nSet password (secure link): ${props.setupPasswordUrl}\nControl panel: ${props.controlPanelUrl}\nGetting started: ${props.gettingStartedUrl}\nSupport: ${props.supportUrl}`
        );
    },
};

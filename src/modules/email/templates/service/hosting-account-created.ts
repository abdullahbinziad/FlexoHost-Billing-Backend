/**
 * service.hosting_account_created - New hosting account created (WHMCS-style)
 * Sent immediately after successful provisioning with login and server details.
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface HostingAccountCreatedProps {
    clientName: string;
    domain: string;
    cpanelUrl: string;
    cpanelUsername: string;
    cpanelPassword: string;
    serverHostname: string;
    nameserver1: string;
    nameserver2: string;
    clientPortalUrl: string;
    supportEmail: string;
}

export const hostingAccountCreatedTemplate: BaseEmailTemplate<HostingAccountCreatedProps> = {
    key: 'service.hosting_account_created',
    category: 'service',

    buildSubject: () => 'Your Hosting Account Has Been Successfully Created',

    previewText: (p) => `Your hosting account for ${p.domain} has been created and is ready to use.`,

    renderHtml: (props) => {
        const accountRows: { label: string; value: string }[] = [
            { label: 'Domain', value: props.domain },
            { label: 'Control Panel', value: props.cpanelUrl },
            { label: 'Username', value: props.cpanelUsername },
            { label: 'Password', value: props.cpanelPassword },
        ];

        const serverRows: { label: string; value: string }[] = [
            { label: 'Server Hostname', value: props.serverHostname || '' },
            { label: 'Nameserver 1', value: props.nameserver1 },
            { label: 'Nameserver 2', value: props.nameserver2 },
        ];
        const cpanelDomain = props.domain ? `https://${props.domain}/cpanel` : '';
        const webmailUrl = props.domain ? `https://${props.domain}/webmail` : '';

        const content = `
${renderGreetingBlock({ name: props.clientName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">Your hosting account for <strong>${props.domain}</strong> has been successfully created and is ready to use.</p>
  <p style="margin:0 0 24px; font-size:14px; color:#4b5563;">Welcome! You can log in using the details below.</p>

  <p style="margin:0 0 8px; font-size:14px; font-weight:600; color:#374151;">Hosting Account Information</p>
  ${renderInfoTable({ rows: accountRows, title: '' })}

  <p style="margin:24px 0 8px; font-size:14px; font-weight:600; color:#374151;">Server Information</p>
  ${renderInfoTable({ rows: serverRows, title: '' })}

  <p style="margin:24px 0 8px; font-size:14px; font-weight:600; color:#374151;">Login URLs</p>
  <p style="margin:0 0 8px; font-size:14px; color:#4b5563;">cPanel Login:</p>
  <p style="margin:0 0 4px; font-size:13px;"><a href="${props.cpanelUrl}" style="color:#3a9cfd; text-decoration:none;">${props.cpanelUrl}</a></p>
  <p style="margin:0 0 16px; font-size:13px; color:#6b7280;">OR <a href="${cpanelDomain}" style="color:#3a9cfd; text-decoration:none;">${cpanelDomain}</a></p>
  <p style="margin:0 0 8px; font-size:14px; color:#4b5563;">Webmail:</p>
  <p style="margin:0 0 16px; font-size:13px;"><a href="${webmailUrl}" style="color:#3a9cfd; text-decoration:none;">${webmailUrl}</a></p>

  <p style="margin:24px 0 8px; font-size:14px; font-weight:600; color:#374151;">Nameserver Setup</p>
  <p style="margin:0 0 8px; font-size:14px; color:#4b5563;">Please update your domain nameservers to:</p>
  <p style="margin:0 0 4px; font-size:13px; font-family:monospace; color:#1f2937;">${props.nameserver1}</p>
  <p style="margin:0 0 16px; font-size:13px; font-family:monospace; color:#1f2937;">${props.nameserver2}</p>
  <p style="margin:0 0 16px; font-size:13px; color:#6b7280;">DNS propagation may take 0–24 hours.</p>

  <p style="margin:24px 0 8px; font-size:14px; font-weight:600; color:#374151;">Important Notes</p>
  <ul style="margin:0 0 16px; padding-left:20px; font-size:14px; color:#4b5563; line-height:1.6;">
    <li>Keep your login credentials secure.</li>
    <li>Change your password after first login.</li>
    <li>Contact support if you need assistance.</li>
  </ul>

  <p style="margin:24px 0 8px; font-size:14px; font-weight:600; color:#374151;">Support</p>
  <p style="margin:0 0 4px; font-size:14px; color:#4b5563;">Client Portal: <a href="${props.clientPortalUrl}" style="color:#3a9cfd; text-decoration:none;">${props.clientPortalUrl}</a></p>
  <p style="margin:0 0 0; font-size:14px; color:#4b5563;">Support Email: <a href="mailto:${props.supportEmail}" style="color:#3a9cfd; text-decoration:none;">${props.supportEmail}</a></p>

  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) => {
        const webmailUrl = props.domain ? `https://${props.domain}/webmail` : '';
        const cpanelDomain = props.domain ? `https://${props.domain}/cpanel` : '';
        return htmlToPlainText(
            `Hello ${props.clientName},\n\n` +
            `Your hosting account for ${props.domain} has been successfully created and is ready to use.\n\n` +
            `Hosting Account Information\nDomain: ${props.domain}\nControl Panel: ${props.cpanelUrl}\nUsername: ${props.cpanelUsername}\nPassword: ${props.cpanelPassword}\n\n` +
            `Server Information\nServer Hostname: ${props.serverHostname || ''}\nNameserver 1: ${props.nameserver1}\nNameserver 2: ${props.nameserver2}\n\n` +
            `Login URLs\ncPanel: ${props.cpanelUrl}\nOR ${cpanelDomain}\nWebmail: ${webmailUrl}\n\n` +
            `Nameserver Setup\nPlease update your domain nameservers to:\n${props.nameserver1}\n${props.nameserver2}\nDNS propagation may take 0–24 hours.\n\n` +
            `Important Notes\n- Keep your login credentials secure.\n- Change your password after first login.\n- Contact support if you need assistance.\n\n` +
            `Support\nClient Portal: ${props.clientPortalUrl}\nSupport Email: ${props.supportEmail}`
        );
    },
};

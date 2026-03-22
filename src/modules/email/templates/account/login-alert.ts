/**
 * account.login_alert - Notify user of a successful sign-in (password or social)
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';
import { escapeHtml } from '../../../../utils/string.util';

export interface LoginAlertProps {
    customerName: string;
    /** Human-readable timestamp (e.g. UTC) */
    loginTime: string;
    ipAddress: string;
    userAgent: string;
    /** e.g. "Email & password" or "Google" */
    signInMethod: string;
    accountSettingsUrl: string;
}

export const loginAlertTemplate: BaseEmailTemplate<LoginAlertProps> = {
    key: 'account.login_alert',
    category: 'account',

    buildSubject: (p) => `New sign-in to your ${p.companyName} account`,

    previewText: (_p) =>
        `We noticed a new login to your account. If this was you, no action is needed.`,

    renderHtml: (props) => {
        const ua =
            props.userAgent.length > 200 ? `${props.userAgent.slice(0, 200)}…` : props.userAgent;
        const rows: [string, string][] = [
            ['Time', props.loginTime],
            ['Sign-in method', props.signInMethod],
            ['IP address', props.ipAddress],
            ['Device / browser', ua],
        ];
        const detailsHtml = rows
            .map(
                ([k, v]) =>
                    `<tr><td style="padding:8px 12px 8px 0; color:#6b7280; font-size:14px; vertical-align:top; width:140px;">${escapeHtml(k)}</td><td style="padding:8px 0; font-size:14px; color:#111827; word-break:break-word;">${escapeHtml(v)}</td></tr>`
            )
            .join('');
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">We noticed a successful sign-in to your account. If this was you, you can ignore this message.</p>
  <p style="margin:0 0 16px;">If you don't recognize this activity, secure your account immediately: change your password and contact <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a>.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:16px 0; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
    <tbody>${detailsHtml}</tbody>
  </table>
  ${renderAlertBox({
      variant: 'info',
      message: `Manage security options in your account: <a href="${props.accountSettingsUrl}" style="color:#1e40af; font-weight:600;">Account settings</a>`,
  })}
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Hi ${props.customerName}, new sign-in to your account.\n\nTime: ${props.loginTime}\nMethod: ${props.signInMethod}\nIP: ${props.ipAddress}\nDevice: ${props.userAgent}\n\nIf this wasn't you, change your password and contact ${props.supportEmail}.\nSettings: ${props.accountSettingsUrl}`
        ),
};

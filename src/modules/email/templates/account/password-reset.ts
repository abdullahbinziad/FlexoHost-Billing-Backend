/**
 * account.password_reset - Secure password reset email
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderCTAButton, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface PasswordResetProps {
    customerName: string;
    resetUrl: string;
    expiresIn: string;
    requestIp?: string;
    requestTime?: string;
}

export const passwordResetTemplate: BaseEmailTemplate<PasswordResetProps> = {
    key: 'account.password_reset',
    category: 'account',

    buildSubject: (p) => `Reset your password - ${p.companyName}`,

    previewText: (_p) => `You requested a password reset. Click to set a new password.`,

    renderHtml: (props) => {
        const securityNote = [
            'For your security, we never send your password by email.',
            'If you did not request this reset, please ignore this email and your password will remain unchanged.',
            'This link will expire in ' + props.expiresIn + '.',
        ].join(' ');

        const requestInfo =
            props.requestIp || props.requestTime
                ? `<p style="margin:16px 0 0; font-size:12px; color:#6b7280;">Request from: ${[props.requestIp, props.requestTime].filter(Boolean).join(' • ')}</p>`
                : '';

        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">You requested a password reset for your ${props.companyName} account.</p>
  <p style="margin:0 0 16px;">Click the button below to set a new password:</p>
  ${renderCTAButton({ href: props.resetUrl, label: 'Reset Password' })}
  ${renderAlertBox({ message: securityNote, variant: 'warning' })}
  <p style="margin:16px 0 0; font-size:14px; color:#6b7280;">If you did not request this, ignore this email. Your password will remain unchanged.</p>
  ${requestInfo}
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Hi ${props.customerName}, reset your password: ${props.resetUrl} (expires in ${props.expiresIn}). We never send passwords by email. If you didn't request this, ignore this email.`
        ),
};

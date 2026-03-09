/**
 * account.verify_email - Ask user to verify email after registration or email change
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderCTAButton, renderAlertBox, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface VerifyEmailProps {
    customerName: string;
    verificationUrl: string;
    expiresIn: string;
}

export const verifyEmailTemplate: BaseEmailTemplate<VerifyEmailProps> = {
    key: 'account.verify_email',
    category: 'account',

    buildSubject: (p) => `Verify your email - ${p.companyName}`,

    previewText: (_p) => `Click to verify your email address and secure your account.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">Please verify your email address to secure your account and access all features of ${props.companyName}.</p>
  <p style="margin:0 0 16px;">Click the button below to verify your email. This link will expire in <strong>${props.expiresIn}</strong>.</p>
  ${renderCTAButton({ href: props.verificationUrl, label: 'Verify Email Address' })}
  ${renderAlertBox({ message: `If the button doesn't work, copy and paste this link into your browser: ${props.verificationUrl}`, variant: 'info' })}
  <p style="margin:16px 0 0; font-size:14px; color:#6b7280;">If you didn't create an account or request this change, you can safely ignore this email. No action is needed.</p>
  <p style="margin:8px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Hi ${props.customerName}, verify your email: ${props.verificationUrl} (expires in ${props.expiresIn}). If you didn't request this, ignore this email.`
        ),
};

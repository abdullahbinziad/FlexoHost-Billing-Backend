/**
 * account.welcome - Welcome newly registered hosting customer
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface WelcomeProps {
    customerName: string;
    clientAreaUrl: string;
    supportUrl: string;
    knowledgebaseUrl: string;
}

export const welcomeTemplate: BaseEmailTemplate<WelcomeProps> = {
    key: 'account.welcome',
    category: 'account',

    buildSubject: (p) => `Welcome to ${p.companyName}!`,

    previewText: (_p) => `Your account is ready. Log in to manage your services, view invoices, and get support.`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName, greeting: 'Welcome' })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">We're thrilled to have you on board. Your hosting account has been successfully created.</p>
  <p style="margin:0 0 16px;">You can now access your client area to manage your services, view invoices, update your profile, and open support tickets.</p>
  <p style="margin:0 0 16px;"><strong>Next step:</strong> Log in to your account and complete your profile. If you have any questions, our support team is available 24/7.</p>
  ${renderCTAButton({ href: props.clientAreaUrl, label: 'Log in to Client Area' })}
  <p style="margin:24px 0 0; font-size:14px; color:#6b7280;">
    <a href="${props.supportUrl}" style="color:#3a9cfd; text-decoration:none; font-weight:500;">Contact Support</a>
    &nbsp;|&nbsp;
    <a href="${props.knowledgebaseUrl}" style="color:#3a9cfd; text-decoration:none; font-weight:500;">Knowledge Base</a>
  </p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `Welcome, ${props.customerName}! Your account is ready. Log in at ${props.clientAreaUrl}. Support: ${props.supportUrl}. Knowledge Base: ${props.knowledgebaseUrl}.`
        ),
};

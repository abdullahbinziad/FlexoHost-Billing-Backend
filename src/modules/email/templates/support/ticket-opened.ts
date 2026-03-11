/**
 * support.ticket_opened - Support ticket acknowledgment
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderCTAButton, renderStatusBadge, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface TicketAttachment {
    url: string;
    filename: string;
    mimeType?: string;
}

export interface TicketOpenedProps {
    customerName: string;
    ticketId: string;
    ticketSubject: string;
    priority: string;
    department: string;
    createdAt: string;
    summaryMessage?: string;
    ticketUrl: string;
    attachments?: TicketAttachment[];
}

export const ticketOpenedTemplate: BaseEmailTemplate<TicketOpenedProps> = {
    key: 'support.ticket_opened',
    category: 'support',

    buildSubject: (p) => `Support Ticket #${p.ticketId} - ${p.ticketSubject}`,

    previewText: (p) => `We've received your support request. Ticket #${p.ticketId}`,

    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">We've received your support request and our team will respond shortly.</p>
  ${renderInfoTable({
      rows: [
        { label: 'Ticket ID', value: props.ticketId },
        { label: 'Subject', value: props.ticketSubject },
        { label: 'Priority', value: renderStatusBadge({ status: props.priority, variant: props.priority === 'High' || props.priority === 'Urgent' ? 'warning' : 'info' }) },
        { label: 'Department', value: props.department },
        { label: 'Created', value: props.createdAt },
      ],
      title: 'Ticket Details',
  })}
  ${props.summaryMessage ? `<p style="margin:16px 0; font-size:14px; color:#4b5563;">${props.summaryMessage}</p>` : ''}
  ${props.attachments && props.attachments.length > 0 ? `
  <p style="margin:16px 0 8px; font-size:14px; font-weight:600; color:#374151;">Attachments:</p>
  <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
    ${props.attachments.map((att) => {
        const isImage = (att.mimeType || '').startsWith('image/');
        return isImage
            ? `<a href="${att.url}" target="_blank" style="display:block;"><img src="${att.url}" alt="${att.filename}" style="max-width:200px; max-height:150px; border-radius:8px; border:1px solid #e5e7eb;" /></a>`
            : `<a href="${att.url}" target="_blank" style="display:inline-block; padding:8px 12px; background:#f3f4f6; border-radius:6px; font-size:13px; color:#374151; text-decoration:none;">${att.filename}</a>`;
    }).join('')}
  </div>
  ` : ''}
  ${renderCTAButton({ href: props.ticketUrl, label: 'View Ticket' })}
  <p style="margin:16px 0 0; font-size:14px; color:#6b7280;"><strong>Expected next step:</strong> A support agent will review your ticket and respond within 24 hours.</p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) => {
        const attachmentNote = props.attachments && props.attachments.length > 0
            ? ` Attachments: ${props.attachments.map((a) => a.url).join(', ')}.`
            : '';
        return htmlToPlainText(
            `Support ticket #${props.ticketId} received. Subject: ${props.ticketSubject}. Priority: ${props.priority}. Department: ${props.department}. Created: ${props.createdAt}.${props.summaryMessage ? ` ${props.summaryMessage}` : ''}${attachmentNote} View: ${props.ticketUrl}. Expected: A support agent will respond within 24 hours.`
        );
    },
};

/**
 * support.ticket_reply - New reply on support ticket (staff reply to client, or client reply notice)
 */

import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface TicketReplyProps {
    customerName: string;
    ticketId: string;
    ticketSubject: string;
    priority: string;
    department: string;
    createdAt: string;
    summaryMessage: string;
    ticketUrl: string;
    /** 'staff_reply' = staff replied to client; 'client_reply' = client replied (for admin email) */
    replyType?: 'staff_reply' | 'client_reply';
}

export const ticketReplyTemplate: BaseEmailTemplate<TicketReplyProps> = {
    key: 'support.ticket_reply',
    category: 'support',

    buildSubject: (p) => `New reply on Ticket #${p.ticketId} - ${p.ticketSubject}`,

    previewText: (p) => `There's a new reply on your support ticket #${p.ticketId}`,

    renderHtml: (props) => {
        const intro =
            props.replyType === 'staff_reply'
                ? "Our support team has replied to your ticket. Please log in to view the full response."
                : "We've received your reply. Our team will review it and respond shortly.";
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderSectionCard(`
  <p style="margin:0 0 16px;">${intro}</p>
  ${renderInfoTable({
      rows: [
          { label: 'Ticket ID', value: props.ticketId },
          { label: 'Subject', value: props.ticketSubject },
          { label: 'Priority', value: props.priority },
          { label: 'Department', value: props.department },
          { label: 'Updated', value: props.createdAt },
      ],
      title: 'Ticket Details',
  })}
  ${props.summaryMessage ? `<p style="margin:16px 0; font-size:14px; color:#4b5563; border-left:4px solid #3a9cfd; padding-left:12px;">${props.summaryMessage}</p>` : ''}
  ${renderCTAButton({ href: props.ticketUrl, label: 'View Ticket' })}
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },

    renderText: (props) =>
        htmlToPlainText(
            `New reply on ticket #${props.ticketId}. Subject: ${props.ticketSubject}. ${props.summaryMessage ? props.summaryMessage + '. ' : ''}View: ${props.ticketUrl}`
        ),
};

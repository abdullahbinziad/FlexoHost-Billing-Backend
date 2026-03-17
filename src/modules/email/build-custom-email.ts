/**
 * Build custom/compose email HTML with standard template:
 * - Email header (brand)
 * - Greeting: "Hello, {clientName}!"
 * - Message body
 * - Signature
 * - Email footer (brand)
 *
 * Used for: single client compose, bulk compose
 */

import { escapeHtml } from '../../utils/string.util';
import { mergeBrandProps } from './templates/config';
import { renderDefaultLayout } from './templates/layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderSignatureBlock } from './templates/blocks';

export interface BuildCustomEmailOptions {
    clientName: string;
    message: string;
    senderLabel: string;
    /** If true, message is treated as HTML (e.g. from rich editor). Use with caution. */
    bodyIsHtml?: boolean;
}

/**
 * Build full HTML for custom/compose emails with header, footer, and greeting.
 */
export function buildCustomEmailHtml(options: BuildCustomEmailOptions): string {
    const { clientName, message, senderLabel, bodyIsHtml = false } = options;

    const messageContent = bodyIsHtml
        ? message
        : escapeHtml(message).replace(/\n/g, '<br />');

    const content = `
${renderGreetingBlock({ name: clientName, greeting: 'Hello' })}
${renderSectionCard(`
  <div style="margin:0 0 16px;">${messageContent}</div>
  ${renderSignatureBlock({ signerName: senderLabel, signerTitle: 'Customer Support' })}
`)}
`;

    const brandProps = mergeBrandProps({});
    return renderDefaultLayout({ ...brandProps, content });
}

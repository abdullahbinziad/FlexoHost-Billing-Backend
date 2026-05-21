import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface LateFeeAppliedProps {
    customerName: string;
    invoiceNumber: string;
    originalDueDate: string;
    lateFeeAmount: string;
    newAmountDue: string;
    currency: string;
    paymentUrl: string;
}

export const lateFeeAppliedTemplate: BaseEmailTemplate<LateFeeAppliedProps> = {
    key: 'billing.late_fee_applied',
    category: 'billing',
    buildSubject: (p) => `Late Fee Applied - Invoice ${p.invoiceNumber}`,
    previewText: (p) => `A late fee of ${p.currency} ${p.lateFeeAmount} was applied to invoice ${p.invoiceNumber}.`,
    renderHtml: (props) => {
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({
    message: 'A late fee has been added because this invoice remains unpaid after the configured grace period.',
    variant: 'warning',
})}
${renderSectionCard(`
  ${renderInfoTable({
      rows: [
        { label: 'Invoice Number', value: props.invoiceNumber },
        { label: 'Original Due Date', value: props.originalDueDate },
        { label: 'Late Fee', value: `${props.currency} ${props.lateFeeAmount}` },
        { label: 'New Amount Due', value: `${props.currency} ${props.newAmountDue}` },
      ],
      title: 'Updated Invoice',
  })}
  ${renderCTAButton({ href: props.paymentUrl, label: 'Pay Updated Invoice' })}
  <p style="margin:16px 0 0; font-size:14px;">Need help? Contact us at <a href="mailto:${props.supportEmail}" style="color:#3a9cfd;">${props.supportEmail}</a></p>
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },
    renderText: (props) =>
        htmlToPlainText(
            `Late fee applied to invoice ${props.invoiceNumber}. Fee: ${props.currency} ${props.lateFeeAmount}. New amount due: ${props.currency} ${props.newAmountDue}. Pay: ${props.paymentUrl}.`
        ),
};

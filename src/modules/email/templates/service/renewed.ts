import type { BaseEmailTemplate } from '../types';
import { renderDefaultLayout } from '../layouts/default.layout';
import { renderGreetingBlock, renderSectionCard, renderInfoTable, renderAlertBox, renderCTAButton, renderSignatureBlock } from '../blocks';
import { htmlToPlainText } from '../utils/plain-text';

export interface ServiceRenewedProps {
    customerName: string;
    serviceName: string;
    serviceIdentifier: string;
    previousDueDate: string;
    nextDueDate: string;
    invoiceNumber?: string;
    manageServiceUrl: string;
}

export const serviceRenewedTemplate: BaseEmailTemplate<ServiceRenewedProps> = {
    key: 'service.renewed',
    category: 'service',
    buildSubject: (p) => `Service Renewed - ${p.serviceName}`,
    previewText: (p) => `Your service ${p.serviceName} has been renewed until ${p.nextDueDate}.`,
    renderHtml: (props) => {
        const rows = [
            { label: 'Service', value: props.serviceName },
            { label: 'Service ID', value: props.serviceIdentifier },
            { label: 'Previous Due Date', value: props.previousDueDate },
            { label: 'Next Due Date', value: props.nextDueDate },
        ];
        if (props.invoiceNumber) rows.push({ label: 'Invoice', value: props.invoiceNumber });
        const content = `
${renderGreetingBlock({ name: props.customerName })}
${renderAlertBox({ message: 'Your service renewal has been processed successfully.', variant: 'success' })}
${renderSectionCard(`
  ${renderInfoTable({ rows, title: 'Renewal Details' })}
  ${renderCTAButton({ href: props.manageServiceUrl, label: 'Manage Service' })}
  ${renderSignatureBlock({})}
`)}
`;
        return renderDefaultLayout({ ...props, content });
    },
    renderText: (props) =>
        htmlToPlainText(
            `Service renewed: ${props.serviceName} (${props.serviceIdentifier}). Previous due date: ${props.previousDueDate}. Next due date: ${props.nextDueDate}. Manage: ${props.manageServiceUrl}`
        ),
};

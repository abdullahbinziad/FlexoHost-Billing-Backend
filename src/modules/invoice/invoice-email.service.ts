import config from '../../config';
import logger from '../../utils/logger';
import Client from '../client/client.model';
import * as emailService from '../email/email.service';
import type { EmailAttachment } from '../email/transport';
import type { EmailLogSource } from '../email/email-log.model';
import type { TemplateKey } from '../email/templates/types';
import Invoice from './invoice.model';
import { getInvoicePdfBuffer } from './pdf/invoice-pdf.service';

type InvoiceLike = any;

interface InvoiceEmailRecipient {
    email: string;
    customerName: string;
}

interface InvoiceEmailContext {
    source?: EmailLogSource;
    actorType?: 'system' | 'user';
    emailType?: string;
    bodyPreview?: string;
    orderId?: string;
}

interface PaymentSuccessEmailInput extends InvoiceEmailContext {
    transactionId?: string;
    amountPaid?: number | string;
    paymentDate?: Date | string;
    paymentMethodLabel?: string;
}

interface LateFeeEmailInput extends InvoiceEmailContext {
    lateFeeAmount: number | string;
}

function baseFrontendUrl(): string {
    return config.frontendUrl.replace(/\/$/, '');
}

function invoiceIdOf(invoice: InvoiceLike): string {
    return invoice?._id?.toString?.() || String(invoice?._id || '');
}

function clientIdOf(invoice: InvoiceLike): string {
    const client = invoice?.clientId;
    return client?._id?.toString?.() || client?.toString?.() || String(client || '');
}

function formatDate(value: unknown): string {
    if (!value) return 'N/A';
    return new Date(value as any).toLocaleDateString();
}

function amountString(value: unknown): string {
    return String(value ?? 0);
}

async function loadInvoice(invoiceOrId: InvoiceLike | string): Promise<InvoiceLike | null> {
    if (typeof invoiceOrId === 'string') {
        return Invoice.findById(invoiceOrId).lean();
    }
    return invoiceOrId;
}

async function resolveRecipient(invoice: InvoiceLike): Promise<InvoiceEmailRecipient | null> {
    const clientId = clientIdOf(invoice);
    if (!clientId) return null;

    const client = await Client.findById(clientId)
        .select('contactEmail firstName lastName user')
        .populate('user', 'email')
        .lean();
    const email = (client as any)?.contactEmail || (client as any)?.user?.email || '';
    if (!email) return null;

    const customerName = client
        ? `${(client as any).firstName || ''} ${(client as any).lastName || ''}`.trim() || 'Customer'
        : 'Customer';

    return { email, customerName };
}

export async function buildInvoicePdfAttachment(
    invoiceOrId: InvoiceLike | string,
    options: { filenamePrefix?: string } = {}
): Promise<EmailAttachment[] | undefined> {
    const invoice = await loadInvoice(invoiceOrId);
    if (!invoice) return undefined;

    try {
        const pdfBuffer = await getInvoicePdfBuffer(invoice as any);
        return [
            {
                filename: `${options.filenamePrefix || 'Invoice'}-${invoice.invoiceNumber}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            },
        ];
    } catch (error: any) {
        logger.warn(`[InvoiceEmail] PDF generation failed for invoice ${invoice.invoiceNumber || invoiceIdOf(invoice)}:`, error?.message || error);
        return undefined;
    }
}

function buildLineItems(invoice: InvoiceLike): Array<{ label: string; amount: string }> {
    const lineItems = (invoice.items || []).map((item: any) => ({
        label: item.description || 'Item',
        amount: amountString(item.amount),
    }));
    if (lineItems.length === 0) {
        lineItems.push({ label: 'Total', amount: amountString(invoice.total) });
    }
    return lineItems;
}

function logContext(invoice: InvoiceLike, context: InvoiceEmailContext) {
    return {
        clientId: clientIdOf(invoice),
        invoiceId: invoiceIdOf(invoice),
        orderId: context.orderId || invoice?.orderId?.toString?.(),
        source: context.source || 'system',
        actorType: context.actorType || 'system',
        emailType: context.emailType,
        bodyPreview: context.bodyPreview,
    };
}

export async function sendInvoiceCreatedEmail(
    invoiceOrId: InvoiceLike | string,
    context: InvoiceEmailContext = {}
) {
    const invoice = await loadInvoice(invoiceOrId);
    if (!invoice) return { success: false, error: 'Invoice not found' };

    const recipient = await resolveRecipient(invoice);
    if (!recipient) {
        logger.warn(`[InvoiceEmail] No recipient for invoice ${invoice.invoiceNumber || invoiceIdOf(invoice)}; skipping invoice-created email`);
        return { success: false, error: 'No client email found' };
    }

    return emailService.sendTemplatedEmail({
        to: recipient.email,
        templateKey: 'billing.invoice_created',
        props: {
            customerName: recipient.customerName,
            invoiceNumber: invoice.invoiceNumber,
            dueDate: formatDate(invoice.dueDate),
            amountDue: amountString(invoice.balanceDue ?? invoice.total),
            currency: invoice.currency || 'BDT',
            invoiceUrl: `${baseFrontendUrl()}/invoices/${invoiceIdOf(invoice)}`,
            billingUrl: `${baseFrontendUrl()}/client`,
            lineItems: buildLineItems(invoice),
        },
        attachments: await buildInvoicePdfAttachment(invoice),
        logContext: logContext(invoice, {
            emailType: 'billing.invoice_created',
            bodyPreview: `Invoice ${invoice.invoiceNumber}`,
            ...context,
        }),
    });
}

export async function sendPaymentSuccessEmail(
    invoiceOrId: InvoiceLike | string,
    input: PaymentSuccessEmailInput = {}
) {
    const invoice = await loadInvoice(invoiceOrId);
    if (!invoice) return { success: false, error: 'Invoice not found' };

    const recipient = await resolveRecipient(invoice);
    if (!recipient) {
        logger.warn(`[InvoiceEmail] No recipient for invoice ${invoice.invoiceNumber || invoiceIdOf(invoice)}; skipping payment-success email`);
        return { success: false, error: 'No client email found' };
    }

    return emailService.sendTemplatedEmail({
        to: recipient.email,
        templateKey: 'billing.payment_success',
        props: {
            customerName: recipient.customerName,
            invoiceNumber: invoice.invoiceNumber,
            transactionId: input.transactionId || 'N/A',
            amountPaid: amountString(input.amountPaid ?? invoice.total),
            currency: invoice.currency || 'BDT',
            paymentDate: formatDate(input.paymentDate || new Date()),
            paymentMethodLabel: input.paymentMethodLabel || invoice.paymentMethod || 'Payment',
            billingUrl: `${baseFrontendUrl()}/client`,
        },
        attachments: await buildInvoicePdfAttachment(invoice, { filenamePrefix: 'Paid-Invoice' }),
        logContext: logContext(invoice, {
            emailType: 'billing.payment_success',
            bodyPreview: `Payment received for ${invoice.invoiceNumber}`,
            ...input,
        }),
    });
}

const LEGACY_REMINDER_TO_TEMPLATE: Record<string, TemplateKey> = {
    'invoice-pre-reminder': 'billing.invoice_due_soon',
    'invoice-due-today': 'billing.invoice_due_today',
    'invoice-overdue-1': 'billing.invoice_overdue_first',
    'invoice-overdue-2': 'billing.invoice_overdue_first',
    'invoice-overdue-3': 'billing.invoice_overdue_first',
    'invoice-overdue-7': 'billing.invoice_overdue_second',
    'invoice-overdue-14': 'billing.invoice_overdue_final',
    'invoice-suspension-warning': 'service.suspension_warning',
};

function reminderProps(templateKey: TemplateKey, invoice: InvoiceLike, recipient: InvoiceEmailRecipient, context: Record<string, any>) {
    const base = baseFrontendUrl();
    const dueDate = formatDate(invoice.dueDate);
    const balanceDue = amountString(invoice.balanceDue ?? invoice.total);
    const currency = invoice.currency || 'BDT';
    const invoiceNumber = invoice.invoiceNumber || 'N/A';

    if (templateKey === 'service.suspension_warning') {
        return {
            customerName: recipient.customerName,
            serviceName: context.serviceName || 'Hosting Service',
            serviceIdentifier: context.serviceIdentifier || invoiceNumber,
            reason: `Unpaid invoice ${invoiceNumber}`,
            suspensionDate: context.suspensionDate || dueDate,
            paymentUrl: `${base}/invoices/${invoiceIdOf(invoice)}/pay`,
            billingUrl: `${base}/client`,
        };
    }

    return {
        customerName: recipient.customerName,
        invoiceNumber,
        originalDueDate: dueDate,
        overdueDays: Number(context.daysOverdue ?? 0),
        amountDue: balanceDue,
        currency,
        paymentUrl: `${base}/invoices/${invoiceIdOf(invoice)}/pay`,
    };
}

export async function sendInvoiceReminderEmail(
    invoiceOrId: InvoiceLike | string,
    legacyTemplateName: string,
    context: Record<string, any> = {}
) {
    const invoice = await loadInvoice(invoiceOrId);
    if (!invoice) return { success: false, error: 'Invoice not found' };

    const templateKey = LEGACY_REMINDER_TO_TEMPLATE[legacyTemplateName] || 'billing.invoice_due_soon';
    const recipient = await resolveRecipient(invoice);
    if (!recipient) {
        logger.warn(`[InvoiceEmail] No recipient for invoice ${invoice.invoiceNumber || invoiceIdOf(invoice)}; skipping reminder email`);
        return { success: false, error: 'No client email found' };
    }

    return emailService.sendTemplatedEmail({
        to: recipient.email,
        templateKey,
        props: reminderProps(templateKey, invoice, recipient, context),
        attachments: await buildInvoicePdfAttachment(invoice),
        logContext: logContext(invoice, {
            source: context.source || 'system',
            actorType: 'system',
            emailType: legacyTemplateName,
            bodyPreview: `Invoice reminder ${invoice.invoiceNumber}`,
        }),
    });
}

export async function sendLateFeeAppliedEmail(
    invoiceOrId: InvoiceLike | string,
    input: LateFeeEmailInput
) {
    const invoice = await loadInvoice(invoiceOrId);
    if (!invoice) return { success: false, error: 'Invoice not found' };

    const recipient = await resolveRecipient(invoice);
    if (!recipient) {
        logger.warn(`[InvoiceEmail] No recipient for invoice ${invoice.invoiceNumber || invoiceIdOf(invoice)}; skipping late-fee email`);
        return { success: false, error: 'No client email found' };
    }

    return emailService.sendTemplatedEmail({
        to: recipient.email,
        templateKey: 'billing.late_fee_applied',
        props: {
            customerName: recipient.customerName,
            invoiceNumber: invoice.invoiceNumber,
            originalDueDate: formatDate(invoice.dueDate),
            lateFeeAmount: amountString(input.lateFeeAmount),
            newAmountDue: amountString(invoice.balanceDue ?? invoice.total),
            currency: invoice.currency || 'BDT',
            paymentUrl: `${baseFrontendUrl()}/invoices/${invoiceIdOf(invoice)}/pay`,
        },
        attachments: await buildInvoicePdfAttachment(invoice),
        logContext: logContext(invoice, {
            emailType: 'billing.late_fee_applied',
            bodyPreview: `Late fee applied to ${invoice.invoiceNumber}`,
            ...input,
        }),
    });
}

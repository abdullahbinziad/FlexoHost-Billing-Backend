/**
 * Email Service - Send templated emails via registry
 */

import config from '../../config';
import logger from '../../utils/logger';
import { getTemplate } from './templates/registry';
import { mergeBrandProps } from './templates/config';
import { validateProps } from './templates/schemas';
import { sendViaTransport, isTransportConfigured } from './transport';
import type { TemplateKey } from './templates/types';
import type { SendResult } from './templates/types';

export interface SendTemplatedEmailOptions<T = Record<string, unknown>> {
    to: string;
    templateKey: TemplateKey;
    props: T & Partial<{ companyName: string; supportEmail: string; websiteUrl: string; logoUrl?: string }>;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
}

/**
 * Send a templated email - primary API
 * Validates props with Zod before rendering; returns readable validation errors on failure.
 */
export async function sendTemplatedEmail<T>(
    options: SendTemplatedEmailOptions<T>
): Promise<SendResult> {
    const { to, templateKey, props, replyTo, cc, bcc } = options;

    const validation = validateProps(templateKey, props);
    if (!validation.success) {
        logger.warn(`[Email] Validation failed for ${templateKey}: ${validation.message}`);
        return { success: false, error: `Validation failed: ${validation.message}` };
    }

    const template = getTemplate(templateKey);
    const validatedData = validation.data as Record<string, unknown>;
    const fullProps = mergeBrandProps({ ...validatedData, ...props } as Record<string, unknown>) as any;

    const subject = template.buildSubject(fullProps);
    const html = template.renderHtml(fullProps);
    const text = template.renderText(fullProps);

    if (!isTransportConfigured()) {
        logger.warn(`[Email-Stub] ${templateKey} to ${to} | Subject: ${subject}`);
        return { success: true };
    }

    return sendViaTransport({
        to,
        subject,
        html,
        text,
        replyTo,
        cc,
        bcc,
    });
}

/**
 * Legacy: raw send (for non-templated or custom emails)
 */
export interface IEmailOptions {
    to: string;
    subject: string;
    text?: string;
    html: string;
}

export async function sendEmail(options: IEmailOptions): Promise<SendResult> {
    if (!isTransportConfigured()) {
        logger.warn(`[Email-Stub] to ${options.to} | Subject: ${options.subject}`);
        return { success: true };
    }

    return sendViaTransport({
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
    });
}

// --- Convenience methods (delegate to sendTemplatedEmail) ---

export async function sendWelcomeEmail(to: string, name: string): Promise<SendResult> {
    const origin = config.cors?.origin || 'http://localhost:3000';
    const websiteUrl = config.cors?.origin?.replace(/\/$/, '') || 'https://flexohost.com';
    return sendTemplatedEmail({
        to,
        templateKey: 'account.welcome',
        props: {
            customerName: name,
            clientAreaUrl: `${origin}/login`,
            supportUrl: `${websiteUrl}/support`,
            knowledgebaseUrl: `${websiteUrl}/kb`,
        },
    });
}

export async function sendVerificationEmail(
    to: string,
    name: string,
    token: string
): Promise<SendResult> {
    const origin = config.cors?.origin || 'http://localhost:3000';
    return sendTemplatedEmail({
        to,
        templateKey: 'account.verify_email',
        props: {
            customerName: name,
            verificationUrl: `${origin}/verify-email?token=${token}`,
            expiresIn: '24 hours',
        },
    });
}

export async function sendPasswordResetEmail(
    to: string,
    name: string,
    token: string,
    options?: { requestIp?: string; requestTime?: string }
): Promise<SendResult> {
    const origin = config.cors?.origin || 'http://localhost:3000';
    return sendTemplatedEmail({
        to,
        templateKey: 'account.password_reset',
        props: {
            customerName: name,
            resetUrl: `${origin}/reset-password?token=${token}`,
            expiresIn: '1 hour',
            requestIp: options?.requestIp,
            requestTime: options?.requestTime,
        },
    });
}

/**
 * Legacy: send by legacy template name (for notification provider compatibility)
 * Maps old keys like invoice-pre-reminder to new registry templates
 */
const LEGACY_TEMPLATE_MAP: Record<string, TemplateKey> = {
    'invoice-created': 'billing.invoice_created',
    'invoice-pre-reminder': 'billing.overdue_reminder',
    'invoice-due-today': 'billing.overdue_reminder',
    'invoice-overdue-1': 'billing.overdue_reminder',
    'invoice-overdue-2': 'billing.overdue_reminder',
    'invoice-overdue-3': 'billing.overdue_reminder',
    'invoice-overdue-7': 'service.suspension_warning',
    'invoice-overdue-14': 'billing.overdue_reminder',
    'invoice-payment-confirmation': 'billing.payment_success',
    'invoice-modified': 'billing.invoice_created',
};

export async function sendEmailByTemplate(
    to: string,
    _subject: string,
    legacyTemplateName: string,
    context: Record<string, any>
): Promise<boolean> {
    const templateKey = LEGACY_TEMPLATE_MAP[legacyTemplateName];
    if (!templateKey) {
        logger.warn(`Unknown legacy template: ${legacyTemplateName}`);
        return false;
    }

    const invoice = context?.invoice || {};
    const billedTo = invoice.billedTo || {};
    const customerName = billedTo.customerName || 'Customer';
    const invoiceNumber = invoice.invoiceNumber || 'N/A';
    const dueDate = invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString()
        : 'N/A';
    const total = invoice.total ?? 0;
    const balanceDue = invoice.balanceDue ?? total;
    const currency = invoice.currency || 'BDT';
    const origin = config.cors?.origin || 'http://localhost:3000';

    let props: Record<string, unknown> = { customerName, invoiceNumber };

    if (templateKey === 'billing.invoice_created') {
        const items = invoice.items || [];
        const lineItems = items.map((i: any) => ({
            label: i.description || 'Item',
            amount: (i.amount ?? 0).toLocaleString(),
        }));
        props = {
            customerName,
            invoiceNumber,
            dueDate,
            amountDue: balanceDue.toLocaleString(),
            currency,
            invoiceUrl: `${origin}/invoices/${invoice._id}/pay`,
            billingUrl: `${origin}/billing`,
            lineItems: lineItems.length > 0 ? lineItems : [{ label: 'Total', amount: balanceDue.toLocaleString() }],
        };
    } else if (templateKey === 'billing.payment_success') {
        const amount = context.amount ?? balanceDue;
        props = {
            customerName,
            invoiceNumber,
            transactionId: context.transactionId || 'N/A',
            amountPaid: amount.toLocaleString(),
            currency,
            paymentDate: new Date().toLocaleDateString(),
            paymentMethodLabel: context.paymentMethod || 'Card',
            billingUrl: `${origin}/billing`,
        };
    } else if (templateKey === 'billing.payment_failed') {
        props = {
            customerName,
            invoiceNumber,
            amountDue: balanceDue.toLocaleString(),
            currency,
            dueDate,
            retryPaymentUrl: `${origin}/invoices/${invoice._id}/pay`,
            billingUrl: `${origin}/billing`,
            serviceName: context.serviceName,
        };
    } else if (templateKey === 'billing.overdue_reminder') {
        const daysOverdueMap: Record<string, number> = {
            'invoice-pre-reminder': -7,
            'invoice-due-today': 0,
            'invoice-overdue-1': 1,
            'invoice-overdue-2': 2,
            'invoice-overdue-3': 3,
            'invoice-overdue-14': 14,
        };
        const overdueDays = context.daysOverdue ?? daysOverdueMap[legacyTemplateName] ?? 0;
        props = {
            customerName,
            invoiceNumber,
            originalDueDate: dueDate,
            overdueDays,
            amountDue: balanceDue.toLocaleString(),
            currency,
            paymentUrl: `${origin}/invoices/${invoice._id}/pay`,
        };
    } else if (templateKey === 'service.suspension_warning') {
        const suspensionDate = context.suspensionDate || dueDate;
        props = {
            customerName,
            serviceName: context.serviceName || 'Hosting Service',
            serviceIdentifier: context.serviceIdentifier || invoiceNumber,
            reason: `Unpaid invoice ${invoiceNumber}`,
            suspensionDate,
            paymentUrl: `${origin}/invoices/${invoice._id}/pay`,
            billingUrl: `${origin}/billing`,
        };
    }

    const result = await sendTemplatedEmail({
        to,
        templateKey,
        props,
    });

    return result.success;
}

// Default export for backward compatibility
export default {
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendEmailByTemplate,
    sendTemplatedEmail,
};

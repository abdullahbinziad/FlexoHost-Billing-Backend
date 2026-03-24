/**
 * Email Service - Send templated emails via registry
 */

import config from '../../config';
import logger from '../../utils/logger';
import { getTemplate } from './templates/registry';
import { mergeBrandProps } from './templates/config';
import { validateProps } from './templates/schemas';
import { sendViaTransport, isTransportConfigured, type EmailAttachment } from './transport';
import type { TemplateKey } from './templates/types';
import type { SendResult } from './templates/types';

export interface SendTemplatedEmailOptions<T = Record<string, unknown>> {
    to: string;
    templateKey: TemplateKey;
    props: T & Partial<{ companyName: string; supportEmail: string; websiteUrl: string; logoUrl?: string }>;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
    attachments?: EmailAttachment[];
}

/**
 * Send a templated email - primary API
 * Validates props with Zod before rendering; returns readable validation errors on failure.
 */
export async function sendTemplatedEmail<T>(
    options: SendTemplatedEmailOptions<T>
): Promise<SendResult> {
    const { to, templateKey, props, replyTo, cc, bcc, attachments } = options;

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

    if (!(await isTransportConfigured())) {
        logger.warn(
            `[Email] SMTP not configured – no email sent. Would send ${templateKey} to ${to} | Subject: ${subject}. Set SMTP_* in the API environment.`
        );
        return {
            success: false,
            error: 'SMTP not configured. Set SMTP_USER and SMTP_PASSWORD in the API environment.',
        };
    }

    return sendViaTransport({
        to,
        subject,
        html,
        text,
        replyTo,
        cc,
        bcc,
        attachments,
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
    if (!(await isTransportConfigured())) {
        logger.warn(`[Email-Stub] to ${options.to} | Subject: ${options.subject}`);
        return {
            success: false,
            error: 'SMTP not configured. Set SMTP_USER and SMTP_PASSWORD in the API environment.',
        };
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
    const base = config.frontendUrl.replace(/\/$/, '');
    const website = config.websiteUrl.replace(/\/$/, '');
    return sendTemplatedEmail({
        to,
        templateKey: 'account.welcome',
        props: {
            customerName: name,
            clientAreaUrl: `${base}/login`,
            supportUrl: `${website}/support`,
            knowledgebaseUrl: `${website}/kb`,
        },
    });
}

export async function sendVerificationEmail(
    to: string,
    name: string,
    token: string
): Promise<SendResult> {
    const base = config.frontendUrl.replace(/\/$/, '');
    return sendTemplatedEmail({
        to,
        templateKey: 'account.verify_email',
        props: {
            customerName: name,
            verificationUrl: `${base}/verify-email?token=${token}`,
            expiresIn: '24 hours',
        },
    });
}

/** Notify user of successful sign-in (password or OAuth). */
export async function sendLoginAlertEmail(
    to: string,
    data: {
        customerName: string;
        loginTime: string;
        ipAddress: string;
        userAgent: string;
        signInMethod: string;
    }
): Promise<SendResult> {
    const base = config.frontendUrl.replace(/\/$/, '');
    return sendTemplatedEmail({
        to,
        templateKey: 'account.login_alert',
        props: {
            ...data,
            accountSettingsUrl: `${base}/settings`,
        },
    });
}

/**
 * Send hosting account ready (service.hosting_ready template, no password).
 * For automatic post-provisioning email with login details, use
 * sendHostingAccountCreatedEmail(serviceId) from the services module instead.
 */
export async function sendHostingAccountReadyEmail(
    to: string,
    customerName: string,
    options: {
        domain: string;
        username: string;
        serverHostname: string;
        nameservers?: string[];
    }
): Promise<SendResult> {
    const base = config.frontendUrl.replace(/\/$/, '');
    const website = config.websiteUrl.replace(/\/$/, '');
    const { protocol, port } = config.controlPanel;
    const controlPanelUrl = `${protocol}://${options.serverHostname}:${port}`;
    return sendTemplatedEmail({
        to,
        templateKey: 'service.hosting_ready',
        props: {
            customerName,
            domain: options.domain,
            serverHostname: options.serverHostname,
            nameservers: options.nameservers || [],
            controlPanelUrl,
            username: options.username,
            setupPasswordUrl: `${base}/login`,
            gettingStartedUrl: `${website}/kb`,
            supportUrl: `${website}/support`,
        },
    });
}

/**
 * Send domain registration confirmation after domain is provisioned.
 */
export async function sendDomainRegistrationEmail(
    to: string,
    customerName: string,
    options: {
        domain: string;
        registrationPeriod: string;
        registrationDate: string;
        autoRenewEnabled?: boolean;
    }
): Promise<SendResult> {
    const base = config.frontendUrl.replace(/\/$/, '');
    return sendTemplatedEmail({
        to,
        templateKey: 'domain.registration_confirmation',
        props: {
            customerName,
            domain: options.domain,
            registrationPeriod: options.registrationPeriod,
            registrationDate: options.registrationDate,
            autoRenewEnabled: options.autoRenewEnabled ?? true,
            manageDomainUrl: `${base}/client`,
        },
    });
}

export async function sendPasswordResetEmail(
    to: string,
    name: string,
    token: string,
    options?: { requestIp?: string; requestTime?: string }
): Promise<SendResult> {
    const base = config.frontendUrl.replace(/\/$/, '');
    return sendTemplatedEmail({
        to,
        templateKey: 'account.password_reset',
        props: {
            customerName: name,
            resetUrl: `${base}/reset-password?token=${token}`,
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
    'support.ticket_opened': 'support.ticket_opened',
    'domain.renewal_reminder': 'domain.renewal_reminder',
    'domain.expired': 'domain.expired_notice',
    'domain.expired_notice': 'domain.expired_notice',
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
    const base = config.frontendUrl.replace(/\/$/, '');

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
            invoiceUrl: `${base}/invoices/${invoice._id}/pay`,
            billingUrl: `${base}/billing`,
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
            billingUrl: `${base}/billing`,
        };
    } else if (templateKey === 'billing.payment_failed') {
        props = {
            customerName,
            invoiceNumber,
            amountDue: balanceDue.toLocaleString(),
            currency,
            dueDate,
            retryPaymentUrl: `${base}/invoices/${invoice._id}/pay`,
            billingUrl: `${base}/billing`,
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
            paymentUrl: `${base}/invoices/${invoice._id}/pay`,
        };
    } else if (templateKey === 'service.suspension_warning') {
        const suspensionDate = context.suspensionDate || dueDate;
        props = {
            customerName,
            serviceName: context.serviceName || 'Hosting Service',
            serviceIdentifier: context.serviceIdentifier || invoiceNumber,
            reason: `Unpaid invoice ${invoiceNumber}`,
            suspensionDate,
            paymentUrl: `${base}/invoices/${invoice._id}/pay`,
            billingUrl: `${base}/billing`,
        };
    } else if (templateKey === 'domain.renewal_reminder') {
        props = {
            customerName: context.customerName || 'Customer',
            domain: context.domain || 'domain.com',
            expirationDate: context.expirationDate || 'N/A',
            daysRemaining: context.daysRemaining ?? 0,
            renewalPrice: String(context.renewalPrice ?? '0'),
            currency: context.currency || 'USD',
            autoRenewEnabled: context.autoRenewEnabled ?? false,
            renewUrl: context.renewUrl || `${base}/domains`,
        };
    } else if (templateKey === 'domain.expired_notice') {
        props = {
            customerName: context.customerName || 'Customer',
            domain: context.domain || 'domain.com',
            expirationDate: context.expirationDate || 'N/A',
            statusLabel: context.statusLabel || 'Expired',
            restoreUrl: context.restoreUrl || `${base}/domains`,
        };
    } else if (templateKey === 'support.ticket_opened') {
        const apiBase = config.api.baseUrl.replace(/\/$/, '');
        const rawAttachments = context.attachments || [];
        const attachments = rawAttachments.map((a: { url: string; filename: string; mimeType?: string }) => ({
            url: a.url.startsWith('http') ? a.url : `${apiBase}${a.url.startsWith('/') ? a.url : '/' + a.url}`,
            filename: a.filename || 'attachment',
            mimeType: a.mimeType || 'image/jpeg',
        }));
        props = {
            customerName: context.customerName || 'Customer',
            ticketId: context.ticketId || 'N/A',
            ticketSubject: context.ticketSubject || 'Support Request',
            priority: context.priority || 'NORMAL',
            department: context.department || 'Support',
            createdAt: context.createdAt || new Date().toISOString(),
            summaryMessage: context.summaryMessage,
            ticketUrl: context.ticketUrl || `${base}/tickets`,
            attachments,
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
    sendLoginAlertEmail,
    sendPasswordResetEmail,
    sendEmailByTemplate,
    sendTemplatedEmail,
};

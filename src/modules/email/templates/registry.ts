/**
 * Template Registry - Central registry for all email templates
 * - Typed mapping from template key to template props
 * - Safe template lookup with inferred prop types
 * - Ready for admin preview page
 */

import type { BaseEmailTemplate, TemplateKey } from './types';
import type { TemplatePropsMap } from './props-map';
import { welcomeTemplate, verifyEmailTemplate, passwordResetTemplate, loginAlertTemplate } from './account';
import {
    invoiceCreatedTemplate,
    invoiceDueSoonTemplate,
    invoiceDueTodayTemplate,
    invoiceOverdueFirstTemplate,
    invoiceOverdueSecondTemplate,
    invoiceOverdueFinalTemplate,
    paymentSuccessTemplate,
    paymentFailedTemplate,
    lateFeeAppliedTemplate,
    overdueReminderTemplate,
} from './billing';
import { orderConfirmationTemplate } from './order';
import {
    hostingReadyTemplate,
    hostingAccountCreatedTemplate,
    suspensionWarningTemplate,
    suspendedTemplate,
    terminatedTemplate,
    terminationWarningTemplate,
    unsuspendedTemplate,
    serviceRenewedTemplate,
} from './service';
import {
    domainRegistrationConfirmationTemplate,
    domainRenewalReminderTemplate,
    domainRenewalSuccessTemplate,
    domainRenewalFailedTemplate,
    domainExpiredNoticeTemplate,
} from './domain';
import { ticketOpenedTemplate, ticketReplyTemplate } from './support';
import { maintenanceNoticeTemplate } from './incident';

/** Central registry - all templates in one place */
export const TEMPLATE_REGISTRY: Record<TemplateKey, BaseEmailTemplate<any>> = {
    'account.welcome': welcomeTemplate,
    'account.verify_email': verifyEmailTemplate,
    'account.password_reset': passwordResetTemplate,
    'account.login_alert': loginAlertTemplate,
    'billing.invoice_created': invoiceCreatedTemplate,
    'billing.invoice_due_soon': invoiceDueSoonTemplate,
    'billing.invoice_due_today': invoiceDueTodayTemplate,
    'billing.invoice_overdue_first': invoiceOverdueFirstTemplate,
    'billing.invoice_overdue_second': invoiceOverdueSecondTemplate,
    'billing.invoice_overdue_final': invoiceOverdueFinalTemplate,
    'billing.payment_success': paymentSuccessTemplate,
    'billing.payment_failed': paymentFailedTemplate,
    'billing.late_fee_applied': lateFeeAppliedTemplate,
    'billing.overdue_reminder': overdueReminderTemplate,
    'order.confirmation': orderConfirmationTemplate,
    'service.hosting_ready': hostingReadyTemplate,
    'service.hosting_account_created': hostingAccountCreatedTemplate,
    'service.suspension_warning': suspensionWarningTemplate,
    'service.suspended': suspendedTemplate,
    'service.termination_warning': terminationWarningTemplate,
    'service.terminated': terminatedTemplate,
    'service.unsuspended': unsuspendedTemplate,
    'service.renewed': serviceRenewedTemplate,
    'domain.registration_confirmation': domainRegistrationConfirmationTemplate,
    'domain.renewal_reminder': domainRenewalReminderTemplate,
    'domain.renewal_success': domainRenewalSuccessTemplate,
    'domain.renewal_failed': domainRenewalFailedTemplate,
    'domain.expired_notice': domainExpiredNoticeTemplate,
    'support.ticket_opened': ticketOpenedTemplate,
    'support.ticket_reply': ticketReplyTemplate,
    'incident.maintenance_notice': maintenanceNoticeTemplate,
};

/** All template keys - for admin preview, iteration */
export const TEMPLATE_KEYS: TemplateKey[] = [
    'account.welcome',
    'account.verify_email',
    'account.password_reset',
    'account.login_alert',
    'order.confirmation',
    'billing.invoice_created',
    'billing.invoice_due_soon',
    'billing.invoice_due_today',
    'billing.invoice_overdue_first',
    'billing.invoice_overdue_second',
    'billing.invoice_overdue_final',
    'billing.payment_success',
    'billing.payment_failed',
    'billing.late_fee_applied',
    'billing.overdue_reminder',
    'service.hosting_ready',
    'service.hosting_account_created',
    'service.suspension_warning',
    'service.suspended',
    'service.termination_warning',
    'service.terminated',
    'service.unsuspended',
    'service.renewed',
    'domain.registration_confirmation',
    'domain.renewal_reminder',
    'domain.renewal_success',
    'domain.renewal_failed',
    'domain.expired_notice',
    'support.ticket_opened',
    'support.ticket_reply',
    'incident.maintenance_notice',
];

/**
 * Get template by key - type-safe, returns template with inferred props
 */
export function getTemplate<K extends TemplateKey>(
    key: K
): BaseEmailTemplate<TemplatePropsMap[K]> {
    const template = TEMPLATE_REGISTRY[key];
    if (!template) {
        throw new Error(`Email template not found: ${key}`);
    }
    return template as BaseEmailTemplate<TemplatePropsMap[K]>;
}

/**
 * Check if template key exists
 */
export function hasTemplate(key: string): key is TemplateKey {
    return key in TEMPLATE_REGISTRY;
}

/**
 * Get all templates for admin preview page
 */
export function getAllTemplates(): Array<{ key: TemplateKey; template: BaseEmailTemplate<any> }> {
    return TEMPLATE_KEYS.map((key) => ({ key, template: TEMPLATE_REGISTRY[key] }));
}

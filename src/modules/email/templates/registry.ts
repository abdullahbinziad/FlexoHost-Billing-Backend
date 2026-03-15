/**
 * Template Registry - Central registry for all email templates
 * - Typed mapping from template key to template props
 * - Safe template lookup with inferred prop types
 * - Ready for admin preview page
 */

import type { BaseEmailTemplate, TemplateKey } from './types';
import type { TemplatePropsMap } from './props-map';
import { welcomeTemplate, verifyEmailTemplate, passwordResetTemplate } from './account';
import {
    invoiceCreatedTemplate,
    paymentSuccessTemplate,
    paymentFailedTemplate,
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
} from './service';
import {
    domainRegistrationConfirmationTemplate,
    domainRenewalReminderTemplate,
    domainExpiredNoticeTemplate,
} from './domain';
import { ticketOpenedTemplate, ticketReplyTemplate } from './support';
import { maintenanceNoticeTemplate } from './incident';

/** Central registry - all templates in one place */
export const TEMPLATE_REGISTRY: Record<TemplateKey, BaseEmailTemplate<any>> = {
    'account.welcome': welcomeTemplate,
    'account.verify_email': verifyEmailTemplate,
    'account.password_reset': passwordResetTemplate,
    'billing.invoice_created': invoiceCreatedTemplate,
    'billing.payment_success': paymentSuccessTemplate,
    'billing.payment_failed': paymentFailedTemplate,
    'billing.overdue_reminder': overdueReminderTemplate,
    'order.confirmation': orderConfirmationTemplate,
    'service.hosting_ready': hostingReadyTemplate,
    'service.hosting_account_created': hostingAccountCreatedTemplate,
    'service.suspension_warning': suspensionWarningTemplate,
    'service.suspended': suspendedTemplate,
    'service.termination_warning': terminationWarningTemplate,
    'service.terminated': terminatedTemplate,
    'domain.registration_confirmation': domainRegistrationConfirmationTemplate,
    'domain.renewal_reminder': domainRenewalReminderTemplate,
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
    'order.confirmation',
    'billing.invoice_created',
    'billing.payment_success',
    'billing.payment_failed',
    'billing.overdue_reminder',
    'service.hosting_ready',
    'service.hosting_account_created',
    'service.suspension_warning',
    'service.suspended',
    'service.termination_warning',
    'service.terminated',
    'domain.registration_confirmation',
    'domain.renewal_reminder',
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

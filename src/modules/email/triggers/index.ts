/**
 * Business triggers - maps application events to email templates
 * Use this to wire business logic to templates without coupling
 */

import type { TemplateKey } from '../templates/types';

export type TriggerEvent =
    | 'user.registered'
    | 'user.verify_email'
    | 'user.forgot_password'
    | 'order.completed'
    | 'invoice.created'
    | 'payment.success'
    | 'payment.failed'
    | 'invoice.overdue'
    | 'hosting.provisioned'
    | 'account.suspension_warning'
    | 'account.suspended'
    | 'domain.registered'
    | 'domain.renewal_reminder'
    | 'domain.expired'
    | 'support.ticket_created'
    | 'incident.maintenance';

export const TRIGGER_TO_TEMPLATE: Record<TriggerEvent, TemplateKey> = {
    'user.registered': 'account.welcome',
    'user.verify_email': 'account.verify_email',
    'user.forgot_password': 'account.password_reset',
    'order.completed': 'order.confirmation',
    'invoice.created': 'billing.invoice_created',
    'payment.success': 'billing.payment_success',
    'payment.failed': 'billing.payment_failed',
    'invoice.overdue': 'billing.overdue_reminder',
    'hosting.provisioned': 'service.hosting_account_created',
    'account.suspension_warning': 'service.suspension_warning',
    'account.suspended': 'service.suspended',
    'domain.registered': 'domain.registration_confirmation',
    'domain.renewal_reminder': 'domain.renewal_reminder',
    'domain.expired': 'domain.expired_notice',
    'support.ticket_created': 'support.ticket_opened',
    'incident.maintenance': 'incident.maintenance_notice',
};

export function getTemplateForTrigger(trigger: TriggerEvent): TemplateKey {
    return TRIGGER_TO_TEMPLATE[trigger];
}

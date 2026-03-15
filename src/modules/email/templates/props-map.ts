/**
 * Typed mapping from template key to template props
 * Enables: getTemplate('account.welcome') -> BaseEmailTemplate<WelcomeProps>
 * Ready for admin preview page - export keys and inferred prop types
 */

import type { TemplateKey } from './types';
import type { WelcomeProps } from './account/welcome';
import type { VerifyEmailProps } from './account/verify-email';
import type { PasswordResetProps } from './account/password-reset';
import type { OrderConfirmationProps } from './order/confirmation';
import type { InvoiceCreatedProps } from './billing/invoice-created';
import type { PaymentSuccessProps } from './billing/payment-success';
import type { PaymentFailedProps } from './billing/payment-failed';
import type { OverdueReminderProps } from './billing/overdue-reminder';
import type { HostingReadyProps } from './service/hosting-ready';
import type { HostingAccountCreatedProps } from './service/hosting-account-created';
import type { SuspensionWarningProps } from './service/suspension-warning';
import type { SuspendedProps } from './service/suspended';
import type { TerminatedProps } from './service/terminated';
import type { TerminationWarningProps } from './service/termination-warning';
import type { DomainRegistrationConfirmationProps } from './domain/registration-confirmation';
import type { DomainRenewalReminderProps } from './domain/renewal-reminder';
import type { DomainExpiredNoticeProps } from './domain/expired-notice';
import type { TicketOpenedProps } from './support/ticket-opened';
import type { TicketReplyProps } from './support/ticket-reply';
import type { MaintenanceNoticeProps } from './incident/maintenance-notice';

/** Typed mapping: template key -> template props (without BrandProps) */
export interface TemplatePropsMap {
    'account.welcome': WelcomeProps;
    'account.verify_email': VerifyEmailProps;
    'account.password_reset': PasswordResetProps;
    'billing.invoice_created': InvoiceCreatedProps;
    'billing.payment_success': PaymentSuccessProps;
    'billing.payment_failed': PaymentFailedProps;
    'billing.overdue_reminder': OverdueReminderProps;
    'order.confirmation': OrderConfirmationProps;
    'service.hosting_ready': HostingReadyProps;
    'service.hosting_account_created': HostingAccountCreatedProps;
    'service.suspension_warning': SuspensionWarningProps;
    'service.suspended': SuspendedProps;
    'service.termination_warning': TerminationWarningProps;
    'service.terminated': TerminatedProps;
    'domain.registration_confirmation': DomainRegistrationConfirmationProps;
    'domain.renewal_reminder': DomainRenewalReminderProps;
    'domain.expired_notice': DomainExpiredNoticeProps;
    'support.ticket_opened': TicketOpenedProps;
    'support.ticket_reply': TicketReplyProps;
    'incident.maintenance_notice': MaintenanceNoticeProps;
}

/** Infer props type for a template key */
export type TemplateProps<K extends TemplateKey> = TemplatePropsMap[K];

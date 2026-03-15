/**
 * Email Template Engine - Core Types
 * Production-grade TypeScript types for hosting company transactional emails
 */

/** Template key union - add new templates here for type safety */
export type TemplateKey =
    // Account
    | 'account.welcome'
    | 'account.verify_email'
    | 'account.password_reset'
    // Billing
    | 'billing.invoice_created'
    | 'billing.payment_success'
    | 'billing.payment_failed'
    | 'billing.overdue_reminder'
    // Order
    | 'order.confirmation'
    // Service
    | 'service.hosting_ready'
    | 'service.hosting_account_created'
    | 'service.suspension_warning'
    | 'service.suspended'
    | 'service.termination_warning'
    | 'service.terminated'
    // Domain
    | 'domain.registration_confirmation'
    | 'domain.renewal_reminder'
    | 'domain.expired_notice'
    // Support
    | 'support.ticket_opened'
    | 'support.ticket_reply'
    // Incident
    | 'incident.maintenance_notice';

/** Email categories for grouping and filtering */
export type EmailCategory =
    | 'account'
    | 'billing'
    | 'order'
    | 'service'
    | 'domain'
    | 'support'
    | 'abuse'
    | 'incident';

/** Base brand props - shared across all templates */
export interface BrandProps {
    companyName: string;
    supportEmail: string;
    websiteUrl: string;
    logoUrl?: string;
}

/** Base email template - generic over variable props */
export interface BaseEmailTemplate<TProps = Record<string, unknown>> {
    key: TemplateKey;
    category: EmailCategory;
    /** Build subject line from props */
    buildSubject: (props: TProps & BrandProps) => string;
    /** Preview text (first ~90 chars shown in inbox) */
    previewText: (props: TProps & BrandProps) => string;
    /** Render HTML body */
    renderHtml: (props: TProps & BrandProps) => string;
    /** Render plain text fallback */
    renderText: (props: TProps & BrandProps) => string;
}

/** Send options for templated email */
export interface SendTemplatedEmailOptions<TProps> {
    to: string;
    templateKey: TemplateKey;
    props: TProps & Partial<BrandProps>;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
}

/** Transport send result */
export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

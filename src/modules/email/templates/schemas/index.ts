/**
 * Zod schema registry - validate template props before render
 * Returns readable validation errors for API consumers
 */

import { z } from 'zod';
import type { TemplateKey } from '../types';
import { brandSchema } from './brand.schema';
import { welcomeSchema, verifyEmailSchema, passwordResetSchema } from './account.schemas';
import {
    invoiceCreatedSchema,
    paymentSuccessSchema,
    paymentFailedSchema,
    overdueReminderSchema,
} from './billing.schemas';
import { orderConfirmationSchema } from './order.schemas';
import { hostingReadySchema, hostingAccountCreatedSchema, suspensionWarningSchema, suspendedSchema, terminationWarningSchema, terminatedSchema } from './service.schemas';
import {
    domainRegistrationConfirmationSchema,
    domainRenewalReminderSchema,
    domainExpiredNoticeSchema,
} from './domain.schemas';
import { ticketOpenedSchema, ticketReplySchema } from './support.schemas';
import { maintenanceNoticeSchema } from './incident.schemas';

/** Schema map: template key -> Zod schema (props only, no brand) */
const SCHEMA_MAP: Record<TemplateKey, z.ZodTypeAny> = {
    'account.welcome': welcomeSchema,
    'account.verify_email': verifyEmailSchema,
    'account.password_reset': passwordResetSchema,
    'billing.invoice_created': invoiceCreatedSchema,
    'billing.payment_success': paymentSuccessSchema,
    'billing.payment_failed': paymentFailedSchema,
    'billing.overdue_reminder': overdueReminderSchema,
    'order.confirmation': orderConfirmationSchema,
    'service.hosting_ready': hostingReadySchema,
    'service.hosting_account_created': hostingAccountCreatedSchema,
    'service.suspension_warning': suspensionWarningSchema,
    'service.suspended': suspendedSchema,
    'service.termination_warning': terminationWarningSchema,
    'service.terminated': terminatedSchema,
    'domain.registration_confirmation': domainRegistrationConfirmationSchema,
    'domain.renewal_reminder': domainRenewalReminderSchema,
    'domain.expired_notice': domainExpiredNoticeSchema,
    'support.ticket_opened': ticketOpenedSchema,
    'support.ticket_reply': ticketReplySchema,
    'incident.maintenance_notice': maintenanceNoticeSchema,
};

/** Readable validation error - for API responses */
export interface ValidationErrorItem {
    path: string;
    message: string;
}

export interface ValidationResult<T> {
    success: true;
    data: T;
}

export interface ValidationFailure {
    success: false;
    errors: ValidationErrorItem[];
    message: string;
}

export type ValidateResult<T> = ValidationResult<T> | ValidationFailure;

/**
 * Format Zod errors into readable structure
 */
function formatZodErrors(error: z.ZodError): ValidationErrorItem[] {
    return error.issues.map((e) => ({
        path: e.path.map(String).join('.'),
        message: (e as { message?: string }).message ?? 'Invalid',
    }));
}

/**
 * Validate template props against schema.
 * Returns parsed data on success, or readable errors on failure.
 */
export function validateProps<K extends TemplateKey>(
    templateKey: K,
    props: unknown
): ValidateResult<z.infer<(typeof SCHEMA_MAP)[K]>> {
    const schema = SCHEMA_MAP[templateKey];
    if (!schema) {
        return {
            success: false,
            errors: [{ path: 'templateKey', message: `Unknown template: ${templateKey}` }],
            message: `Unknown template: ${templateKey}`,
        };
    }

    const result = schema.safeParse(props);
    if (result.success) {
        return { success: true, data: result.data as z.infer<(typeof SCHEMA_MAP)[K]> };
    }

    const errors = formatZodErrors(result.error);
    const message = errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    return {
        success: false,
        errors,
        message,
    };
}

/**
 * Validate props and throw if invalid - for use in send flow when you want to fail fast
 */
export function validatePropsOrThrow<K extends TemplateKey>(
    templateKey: K,
    props: unknown
): z.infer<(typeof SCHEMA_MAP)[K]> {
    const result = validateProps(templateKey, props);
    if (result.success) {
        return result.data;
    }
    throw new Error(`Email template validation failed (${templateKey}): ${result.message}`);
}

export { brandSchema, welcomeSchema, verifyEmailSchema, passwordResetSchema };
export { invoiceCreatedSchema, paymentSuccessSchema, paymentFailedSchema, overdueReminderSchema };
export { orderConfirmationSchema };
export { hostingReadySchema, hostingAccountCreatedSchema, suspensionWarningSchema, suspendedSchema, terminationWarningSchema, terminatedSchema };
export {
    domainRegistrationConfirmationSchema,
    domainRenewalReminderSchema,
    domainExpiredNoticeSchema,
};
export { ticketOpenedSchema, ticketReplySchema };
export { maintenanceNoticeSchema };

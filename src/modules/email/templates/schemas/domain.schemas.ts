/**
 * Zod schemas for domain templates
 */

import { z } from 'zod';

export const domainRegistrationConfirmationSchema = z.object({
    customerName: z.string().min(1),
    domain: z.string().min(1),
    registrationPeriod: z.string().min(1),
    registrationDate: z.string().min(1),
    autoRenewEnabled: z.boolean(),
    manageDomainUrl: z.string().url(),
});
export type DomainRegistrationConfirmationPropsSchema = z.infer<typeof domainRegistrationConfirmationSchema>;

export const domainRenewalReminderSchema = z.object({
    customerName: z.string().min(1),
    domain: z.string().min(1),
    expirationDate: z.string().min(1),
    daysRemaining: z.number().int().min(0),
    renewalPrice: z.string().min(1),
    currency: z.string().min(1),
    autoRenewEnabled: z.boolean().optional(),
    renewUrl: z.string().url(),
});
export type DomainRenewalReminderPropsSchema = z.infer<typeof domainRenewalReminderSchema>;

export const domainRenewalSuccessSchema = z.object({
    customerName: z.string().min(1),
    domain: z.string().min(1),
    previousExpirationDate: z.string().min(1),
    newExpirationDate: z.string().min(1),
    manageDomainUrl: z.string().url(),
});
export type DomainRenewalSuccessPropsSchema = z.infer<typeof domainRenewalSuccessSchema>;

export const domainRenewalFailedSchema = z.object({
    customerName: z.string().min(1),
    domain: z.string().min(1),
    expirationDate: z.string().min(1),
    invoiceNumber: z.string().optional(),
    supportUrl: z.string().url(),
});
export type DomainRenewalFailedPropsSchema = z.infer<typeof domainRenewalFailedSchema>;

export const domainExpiredNoticeSchema = z.object({
    customerName: z.string().min(1),
    domain: z.string().min(1),
    expirationDate: z.string().min(1),
    statusLabel: z.string().min(1),
    restoreUrl: z.string().url(),
});
export type DomainExpiredNoticePropsSchema = z.infer<typeof domainExpiredNoticeSchema>;

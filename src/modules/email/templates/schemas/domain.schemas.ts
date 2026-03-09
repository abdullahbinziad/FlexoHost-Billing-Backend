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
    autoRenewEnabled: z.boolean(),
    renewUrl: z.string().url(),
});
export type DomainRenewalReminderPropsSchema = z.infer<typeof domainRenewalReminderSchema>;

export const domainExpiredNoticeSchema = z.object({
    customerName: z.string().min(1),
    domain: z.string().min(1),
    expirationDate: z.string().min(1),
    statusLabel: z.string().min(1),
    restoreUrl: z.string().url(),
});
export type DomainExpiredNoticePropsSchema = z.infer<typeof domainExpiredNoticeSchema>;

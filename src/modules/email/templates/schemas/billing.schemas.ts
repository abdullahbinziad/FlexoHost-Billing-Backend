/**
 * Zod schemas for billing templates
 */

import { z } from 'zod';

const invoiceLineItemSchema = z.object({
    label: z.string().min(1),
    amount: z.string().min(1),
});

export const invoiceCreatedSchema = z.object({
    customerName: z.string().min(1, 'customerName is required'),
    invoiceNumber: z.string().min(1, 'invoiceNumber is required'),
    dueDate: z.string().min(1, 'dueDate is required'),
    amountDue: z.string().min(1, 'amountDue is required'),
    currency: z.string().min(1, 'currency is required'),
    invoiceUrl: z.string().url('invoiceUrl must be a valid URL'),
    billingUrl: z.string().url('billingUrl must be a valid URL'),
    lineItems: z.array(invoiceLineItemSchema).default([]),
});
export type InvoiceCreatedPropsSchema = z.infer<typeof invoiceCreatedSchema>;

export const paymentSuccessSchema = z.object({
    customerName: z.string().min(1),
    invoiceNumber: z.string().min(1),
    transactionId: z.string().optional(),
    amountPaid: z.string().min(1),
    currency: z.string().min(1),
    paymentDate: z.string().min(1),
    paymentMethodLabel: z.string().min(1),
    billingUrl: z.string().url(),
});
export type PaymentSuccessPropsSchema = z.infer<typeof paymentSuccessSchema>;

export const paymentFailedSchema = z.object({
    customerName: z.string().min(1),
    invoiceNumber: z.string().min(1),
    amountDue: z.string().min(1),
    currency: z.string().min(1),
    dueDate: z.string().min(1),
    retryPaymentUrl: z.string().url(),
    billingUrl: z.string().url(),
    serviceName: z.string().optional(),
});
export type PaymentFailedPropsSchema = z.infer<typeof paymentFailedSchema>;

export const overdueReminderSchema = z.object({
    customerName: z.string().min(1),
    invoiceNumber: z.string().min(1),
    originalDueDate: z.string().min(1),
    overdueDays: z.number().int().min(0),
    amountDue: z.string().min(1),
    currency: z.string().min(1),
    paymentUrl: z.string().url(),
});
export type OverdueReminderPropsSchema = z.infer<typeof overdueReminderSchema>;

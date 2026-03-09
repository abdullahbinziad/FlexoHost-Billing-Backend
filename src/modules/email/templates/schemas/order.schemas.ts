/**
 * Zod schemas for order templates
 */

import { z } from 'zod';

const orderItemSchema = z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    billingCycle: z.string().min(1),
    quantity: z.number().int().min(1),
    price: z.string().min(1),
});

export const orderConfirmationSchema = z.object({
    customerName: z.string().min(1),
    orderNumber: z.string().min(1),
    orderDate: z.string().min(1),
    items: z.array(orderItemSchema).min(1),
    subtotal: z.string().min(1),
    tax: z.string().min(1),
    total: z.string().min(1),
    currency: z.string().min(1),
    paymentStatus: z.string().min(1),
    clientAreaUrl: z.string().url(),
    supportUrl: z.string().url(),
});
export type OrderConfirmationPropsSchema = z.infer<typeof orderConfirmationSchema>;

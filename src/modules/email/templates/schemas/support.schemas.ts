/**
 * Zod schemas for support templates
 */

import { z } from 'zod';

export const ticketOpenedSchema = z.object({
    customerName: z.string().min(1),
    ticketId: z.string().min(1),
    ticketSubject: z.string().min(1),
    priority: z.string().min(1),
    department: z.string().min(1),
    createdAt: z.string().min(1),
    summaryMessage: z.string().optional(),
    ticketUrl: z.string().url(),
});
export type TicketOpenedPropsSchema = z.infer<typeof ticketOpenedSchema>;

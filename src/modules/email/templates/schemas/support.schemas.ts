/**
 * Zod schemas for support templates
 */

import { z } from 'zod';

export const ticketAttachmentSchema = z.object({
    url: z.string().url(),
    filename: z.string(),
    mimeType: z.string().optional(),
});

export const ticketOpenedSchema = z.object({
    customerName: z.string().min(1),
    ticketId: z.string().min(1),
    ticketSubject: z.string().min(1),
    priority: z.string().min(1),
    department: z.string().min(1),
    createdAt: z.string().min(1),
    summaryMessage: z.string().optional(),
    ticketUrl: z.string().url(),
    attachments: z.array(ticketAttachmentSchema).optional(),
});
export type TicketOpenedPropsSchema = z.infer<typeof ticketOpenedSchema>;

export const ticketReplySchema = z.object({
    customerName: z.string().min(1),
    ticketId: z.string().min(1),
    ticketSubject: z.string().min(1),
    priority: z.string().min(1),
    department: z.string().min(1),
    createdAt: z.string().min(1),
    summaryMessage: z.string().min(1),
    ticketUrl: z.string().url(),
    replyType: z.enum(['staff_reply', 'client_reply']).optional(),
});
export type TicketReplyPropsSchema = z.infer<typeof ticketReplySchema>;

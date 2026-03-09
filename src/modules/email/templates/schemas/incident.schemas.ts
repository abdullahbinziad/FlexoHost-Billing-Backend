/**
 * Zod schemas for incident templates
 */

import { z } from 'zod';

export const maintenanceNoticeSchema = z.object({
    customerName: z.string().min(1),
    affectedService: z.string().min(1),
    maintenanceStart: z.string().min(1),
    maintenanceEnd: z.string().min(1),
    expectedDuration: z.string().min(1),
    impactSummary: z.string().min(1),
    statusPageUrl: z.string().url(),
    supportUrl: z.string().url(),
});
export type MaintenanceNoticePropsSchema = z.infer<typeof maintenanceNoticeSchema>;

/**
 * Shared brand props schema - used by all templates
 */

import { z } from 'zod';

export const brandSchema = z.object({
    companyName: z.string().min(1, 'companyName is required'),
    supportEmail: z.string().email('supportEmail must be a valid email'),
    websiteUrl: z.string().url('websiteUrl must be a valid URL'),
    logoUrl: z.string().url().optional(),
});

export type BrandPropsSchema = z.infer<typeof brandSchema>;

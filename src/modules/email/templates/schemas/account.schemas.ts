/**
 * Zod schemas for account templates
 */

import { z } from 'zod';

export const welcomeSchema = z.object({
    customerName: z.string().min(1, 'customerName is required'),
    clientAreaUrl: z.string().url('clientAreaUrl must be a valid URL'),
    supportUrl: z.string().url('supportUrl must be a valid URL'),
    knowledgebaseUrl: z.string().url('knowledgebaseUrl must be a valid URL'),
});
export type WelcomePropsSchema = z.infer<typeof welcomeSchema>;

export const verifyEmailSchema = z.object({
    customerName: z.string().min(1, 'customerName is required'),
    verificationUrl: z.string().url('verificationUrl must be a valid URL'),
    expiresIn: z.string().min(1, 'expiresIn is required'),
});
export type VerifyEmailPropsSchema = z.infer<typeof verifyEmailSchema>;

export const passwordResetSchema = z.object({
    customerName: z.string().min(1, 'customerName is required'),
    resetUrl: z.string().url('resetUrl must be a valid URL'),
    expiresIn: z.string().min(1, 'expiresIn is required'),
    requestIp: z.string().optional(),
    requestTime: z.string().optional(),
});
export type PasswordResetPropsSchema = z.infer<typeof passwordResetSchema>;

/**
 * Zod schemas for service templates
 */

import { z } from 'zod';

export const hostingReadySchema = z.object({
    customerName: z.string().min(1, 'customerName is required'),
    domain: z.string().min(1, 'domain is required'),
    serverHostname: z.string().min(1, 'serverHostname is required'),
    nameservers: z.array(z.string()).default([]),
    controlPanelUrl: z.string().url('controlPanelUrl must be a valid URL'),
    username: z.string().min(1, 'username is required'),
    setupPasswordUrl: z.string().url('setupPasswordUrl must be a valid URL'),
    gettingStartedUrl: z.string().url('gettingStartedUrl must be a valid URL'),
    supportUrl: z.string().url('supportUrl must be a valid URL'),
});
export type HostingReadyPropsSchema = z.infer<typeof hostingReadySchema>;

export const suspensionWarningSchema = z.object({
    customerName: z.string().min(1),
    serviceName: z.string().min(1),
    serviceIdentifier: z.string().optional(),
    reason: z.string().optional(),
    suspensionDate: z.string().min(1),
    paymentUrl: z.string().url(),
    billingUrl: z.string().url().optional(),
});
export type SuspensionWarningPropsSchema = z.infer<typeof suspensionWarningSchema>;

export const suspendedSchema = z.object({
    customerName: z.string().min(1),
    serviceName: z.string().min(1),
    serviceIdentifier: z.string().optional(),
    suspensionReason: z.string().optional(),
    restoreActionUrl: z.string().url(),
    supportUrl: z.string().url(),
});
export type SuspendedPropsSchema = z.infer<typeof suspendedSchema>;

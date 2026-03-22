/**
 * Resolve effective SMTP + From for sending: dashboard (BillingSettings) or environment.
 */

import config from '../../../config';
import BillingSettings from '../../billing-settings/billing-settings.model';
import { decryptSmtpPasswordForUse } from './smtp-password-crypto';

const SETTINGS_KEY = 'global';

export type ResolvedSmtpTls = {
    host: string;
    port: number;
    user: string;
    password: string;
    secure: boolean;
    requireTls: boolean;
    tlsRejectUnauthorized: boolean;
};

export type ResolvedEmailTransportConfig = {
    smtp: ResolvedSmtpTls;
    from: string;
    /** Where values came from for logging / test responses */
    source: 'env' | 'dashboard';
};

let cache: { expires: number; value: ResolvedEmailTransportConfig } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateEmailSmtpConfigCache(): void {
    cache = null;
}

async function loadResolved(): Promise<ResolvedEmailTransportConfig> {
    const env = config.email;
    const doc = await BillingSettings.findOne({ key: SETTINGS_KEY }).select('+smtpPassword').lean().exec();

    const useCustom = !!(doc as { smtpUseCustom?: boolean } | null)?.smtpUseCustom;
    const d = doc as {
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPassword?: string;
        smtpSecure?: boolean;
        smtpRequireTls?: boolean;
        smtpTlsRejectUnauthorized?: boolean;
        emailFrom?: string;
    } | null;

    if (useCustom && d?.smtpHost?.trim() && d?.smtpUser?.trim()) {
        const port = typeof d.smtpPort === 'number' && d.smtpPort > 0 ? d.smtpPort : 587;
        const dbPass = decryptSmtpPasswordForUse(d.smtpPassword).trim();
        /** Empty DB password falls back to SMTP_PASSWORD in .env (documented in admin UI). */
        const password = dbPass || env.smtp.password;
        const secure = d.smtpSecure ?? port === 465;
        const requireTls = d.smtpRequireTls ?? port === 587;
        const tlsRejectUnauthorized = d.smtpTlsRejectUnauthorized !== false;

        return {
            from: (d.emailFrom && d.emailFrom.trim()) || env.from,
            smtp: {
                host: d.smtpHost.trim(),
                port,
                user: d.smtpUser.trim(),
                password,
                secure,
                requireTls,
                tlsRejectUnauthorized,
            },
            source: 'dashboard',
        };
    }

    return {
        from: env.from,
        smtp: {
            host: env.smtp.host,
            port: env.smtp.port,
            user: env.smtp.user,
            password: env.smtp.password,
            secure: env.smtp.secure,
            requireTls: env.smtp.requireTls,
            tlsRejectUnauthorized: env.smtp.tlsRejectUnauthorized,
        },
        source: 'env',
    };
}

export async function resolveEmailSmtpConfig(): Promise<ResolvedEmailTransportConfig> {
    const now = Date.now();
    if (cache && cache.expires > now) {
        return cache.value;
    }
    const value = await loadResolved();
    cache = { expires: now + CACHE_TTL_MS, value };
    return value;
}

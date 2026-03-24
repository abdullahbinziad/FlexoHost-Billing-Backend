/**
 * Resolve SMTP + From for sending — environment variables only (SMTP_*, EMAIL_FROM).
 */

import config from '../../../config';

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
    /** Always env — kept for API compatibility */
    source: 'env';
};

let cache: { expires: number; value: ResolvedEmailTransportConfig } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateEmailSmtpConfigCache(): void {
    cache = null;
}

function loadFromEnv(): ResolvedEmailTransportConfig {
    const env = config.email;
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
    const value = loadFromEnv();
    cache = { expires: now + CACHE_TTL_MS, value };
    return value;
}

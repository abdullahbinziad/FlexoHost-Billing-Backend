/**
 * Nodemailer transport - SMTP email sending
 */

import nodemailer from 'nodemailer';
import logger from '../../../utils/logger';
import type { SendResult } from '../templates/types';
import { resolveEmailSmtpConfig, invalidateEmailSmtpConfigCache, type ResolvedEmailTransportConfig } from '../smtp-resolve';

let transporter: nodemailer.Transporter | null = null;
let transporterCacheKey: string | null = null;

function transportKey(resolved: ResolvedEmailTransportConfig): string {
    const { smtp, from } = resolved;
    return [
        smtp.host,
        smtp.port,
        smtp.user,
        String(smtp.password?.length ?? 0),
        smtp.password?.slice(-2) ?? '',
        smtp.secure ? '1' : '0',
        smtp.requireTls ? '1' : '0',
        smtp.tlsRejectUnauthorized ? '1' : '0',
        from,
    ].join('|');
}

function buildTransportOptions(resolved: ResolvedEmailTransportConfig) {
    const { host, port, user, password, secure, requireTls, tlsRejectUnauthorized } = resolved.smtp;

    return {
        host,
        port,
        secure,
        /** Port 465: implicit TLS. Port 587: STARTTLS — requireTLS helps strict servers / production. */
        requireTLS: secure ? false : requireTls,
        auth: user && password ? { user, pass: password } : undefined,
        tls: {
            rejectUnauthorized: tlsRejectUnauthorized,
        },
        connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '25000', 10),
        greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '25000', 10),
        socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '60000', 10),
    };
}

async function getTransporter(): Promise<nodemailer.Transporter> {
    const resolved = await resolveEmailSmtpConfig();
    const key = transportKey(resolved);
    if (!transporter || transporterCacheKey !== key) {
        transporter = nodemailer.createTransport(buildTransportOptions(resolved));
        transporterCacheKey = key;

        if (process.env.NODE_ENV !== 'test') {
            transporter
                .verify()
                .then(() =>
                    logger.info(`[Email] SMTP ready (${resolved.source}): ${resolved.smtp.host}:${resolved.smtp.port}`)
                )
                .catch((err: NodeJS.ErrnoException) => {
                    logger.warn(
                        `[Email] SMTP verify failed (${err?.code || 'unknown'}): ${err?.message || err}. ` +
                            'Check dashboard SMTP settings or SMTP_* / EMAIL_FROM in .env, firewall (587/465), and credentials.'
                    );
                });
        }
    }
    return transporter;
}

/** Reset singleton (e.g. after SMTP settings change). */
export function resetEmailTransporter(): void {
    transporter = null;
    transporterCacheKey = null;
    invalidateEmailSmtpConfigCache();
}

/**
 * Verify TCP + auth with the SMTP server (does not send a message).
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string; code?: string }> {
    if (!(await isTransportConfigured())) {
        return {
            ok: false,
            error:
                'SMTP credentials missing. Set them under Admin → Settings (custom SMTP) or SMTP_USER and SMTP_PASSWORD in environment.',
        };
    }
    try {
        const t = await getTransporter();
        await t.verify();
        return { ok: true };
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        return {
            ok: false,
            error: e?.message || String(err),
            code: e?.code,
        };
    }
}

export interface EmailAttachment {
    filename: string;
    content: Buffer;
}

export interface SendOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
    attachments?: EmailAttachment[];
}

export async function sendViaTransport(options: SendOptions): Promise<SendResult> {
    try {
        const resolved = await resolveEmailSmtpConfig();
        const transport = await getTransporter();
        const msg = await transport.sendMail({
            from: resolved.from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo,
            cc: options.cc?.join(','),
            bcc: options.bcc?.join(','),
            attachments: options.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
        });

        return {
            success: true,
            messageId: msg.messageId,
        };
    } catch (err: unknown) {
        const e = err as Error;
        logger.error('[Email] sendMail failed:', e?.message || err);
        return {
            success: false,
            error: e?.message || 'Unknown error',
        };
    }
}

export async function isTransportConfigured(): Promise<boolean> {
    const r = await resolveEmailSmtpConfig();
    return !!(r.smtp.user && r.smtp.password);
}

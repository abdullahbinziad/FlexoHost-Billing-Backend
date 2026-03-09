/**
 * Nodemailer transport - SMTP email sending
 */

import nodemailer from 'nodemailer';
import config from '../../../config';
import logger from '../../../utils/logger';
import type { SendResult } from '../templates/types';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: config.email.smtp.host,
            port: config.email.smtp.port,
            secure: config.email.smtp.port === 465,
            auth: {
                user: config.email.smtp.user,
                pass: config.email.smtp.password,
            },
        });

        if (config.env !== 'test') {
            transporter
                .verify()
                .then(() => logger.info('Email transport: Connected to SMTP server'))
                .catch((err) =>
                    logger.warn('Email transport: Unable to connect. Configure SMTP in .env', err)
                );
        }
    }
    return transporter;
}

export interface SendOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
}

export async function sendViaTransport(options: SendOptions): Promise<SendResult> {
    try {
        const transport = getTransporter();
        const msg = await transport.sendMail({
            from: config.email.from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo,
            cc: options.cc?.join(','),
            bcc: options.bcc?.join(','),
        });

        return {
            success: true,
            messageId: msg.messageId,
        };
    } catch (err: any) {
        logger.error('Email send failed:', err);
        return {
            success: false,
            error: err?.message || 'Unknown error',
        };
    }
}

export function isTransportConfigured(): boolean {
    return !!(config.email?.smtp?.user && config.email?.smtp?.password);
}

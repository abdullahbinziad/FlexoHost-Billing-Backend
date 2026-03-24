/**
 * Send one message per registered email template (fixture data from PREVIEW_DATA).
 * Use on production/staging to verify SMTP and every template end-to-end.
 *
 * Run (dev):  npx ts-node src/scripts/send-all-email-templates.ts --to=you@example.com
 * Run (prod): node dist/scripts/send-all-email-templates.js --to=you@example.com
 *
 * Options:
 *   --to=email          Recipient (required unless --dry-run)
 *   --dry-run           Validate and print subjects only; no DB or SMTP
 *   --delay-ms=N        Pause between sends (default 750 or EMAIL_TEST_ALL_DELAY_MS)
 *   --only=template.key Send a single template (e.g. account.welcome)
 */

import mongoose from 'mongoose';
import config from '../config';
import logger from '../utils/logger';
import { TEMPLATE_KEYS, hasTemplate } from '../modules/email/templates/registry';
import { PREVIEW_DATA } from '../modules/email/preview/mocks/preview-data';
import { sendTemplatedEmail } from '../modules/email/email.service';
import { verifySmtpConnection, resetEmailTransporter } from '../modules/email/transport/nodemailer.transport';
import { resolveEmailSmtpConfig } from '../modules/email/smtp';
import { validateProps } from '../modules/email/templates/schemas';
import { getTemplate } from '../modules/email/templates/registry';
import { mergeBrandProps } from '../modules/email/templates/config';
import type { TemplateKey } from '../modules/email/templates/types';

function parseArgs(): {
    to: string;
    dryRun: boolean;
    delayMs: number;
    only?: TemplateKey;
} {
    const argv = process.argv.slice(2);
    let to = '';
    let dryRun = false;
    let delayMs = parseInt(process.env.EMAIL_TEST_ALL_DELAY_MS || '750', 10);
    let only: TemplateKey | undefined;

    for (const a of argv) {
        if (a.startsWith('--to=')) {
            to = a.slice(5).trim();
        } else if (a === '--dry-run') {
            dryRun = true;
        } else if (a.startsWith('--delay-ms=')) {
            const n = parseInt(a.slice(11), 10);
            if (!Number.isNaN(n) && n >= 0) delayMs = n;
        } else if (a.startsWith('--only=')) {
            const key = a.slice(7).trim();
            if (!hasTemplate(key)) {
                logger.error(`Unknown template key: ${key}. Use a key from GET /api/v1/email/templates`);
                process.exit(1);
            }
            only = key as TemplateKey;
        }
    }

    if (!dryRun && !to) {
        logger.error(
            'Missing --to=email. Example: npx ts-node src/scripts/send-all-email-templates.ts --to=you@example.com'
        );
        logger.error('Use --dry-run to validate all templates without sending.');
        process.exit(1);
    }

    return { to, dryRun, delayMs, only };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function runDryRun(keys: TemplateKey[]): Promise<void> {
    let failed = 0;
    for (const key of keys) {
        const props = PREVIEW_DATA[key];
        const validation = validateProps(key, props);
        if (!validation.success) {
            logger.error(`[dry-run] ${key}: ${validation.message}`);
            failed++;
            continue;
        }
        const template = getTemplate(key);
        const data = validation.data as Record<string, unknown>;
        const fullProps = mergeBrandProps({ ...data, ...props } as Record<string, unknown>);
        const subject = template.buildSubject(fullProps as never);
        logger.info(`[dry-run] OK ${key} → ${subject}`);
    }
    if (failed > 0) {
        process.exit(1);
    }
}

async function connectDb(): Promise<void> {
    await mongoose.connect(config.mongodb.uri);
    logger.info('MongoDB connected');
}

async function main(): Promise<void> {
    const { to, dryRun, delayMs, only } = parseArgs();
    const keys: TemplateKey[] = only ? [only] : [...TEMPLATE_KEYS];

    if (dryRun) {
        await runDryRun(keys);
        return;
    }

    await connectDb();
    resetEmailTransporter();

    const resolved = await resolveEmailSmtpConfig();
    logger.info(`SMTP: ${resolved.source} · ${resolved.smtp.host}:${resolved.smtp.port} · from ${resolved.from}`);

    const verify = await verifySmtpConnection();
    if (!verify.ok) {
        logger.error(`SMTP verify failed (${verify.code || 'no code'}): ${verify.error || 'unknown'}`);
        logger.error(
            'Fix SMTP_* in the API environment, firewall egress to 587/465, or try SMTP_FORCE_IPV4=true on VPS with broken IPv6.'
        );
        await mongoose.disconnect();
        process.exit(1);
    }

    let ok = 0;
    let failed = 0;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const props = PREVIEW_DATA[key];
        process.stdout.write(`Sending ${key}… `);
        const result = await sendTemplatedEmail({
            to,
            templateKey: key,
            props,
        });

        if (result.success) {
            console.log(`OK${result.messageId ? ` (${result.messageId})` : ''}`);
            ok++;
        } else {
            console.log(`FAIL: ${result.error}`);
            failed++;
        }

        if (i < keys.length - 1 && delayMs > 0) {
            await sleep(delayMs);
        }
    }

    await mongoose.disconnect();
    logger.info(`Done: ${ok} sent, ${failed} failed (recipient: ${to})`);
    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    logger.error(err);
    process.exit(1);
});

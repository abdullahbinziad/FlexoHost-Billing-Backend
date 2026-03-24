/**
 * TCP + SMTP auth check only (no email sent). Uses SMTP_* / EMAIL_FROM from environment.
 * Run: npm run email:verify
 * Prod: node dist/scripts/verify-smtp-env.js
 */

import { verifySmtpConnection, resetEmailTransporter } from '../modules/email/transport/nodemailer.transport';
import { resolveEmailSmtpConfig } from '../modules/email/smtp';
import logger from '../utils/logger';

async function main(): Promise<void> {
    resetEmailTransporter();
    const resolved = await resolveEmailSmtpConfig();
    logger.info(`SMTP target: ${resolved.smtp.host}:${resolved.smtp.port} | from: ${resolved.from} (${resolved.source})`);

    const verify = await verifySmtpConnection();
    if (!verify.ok) {
        logger.error(`Verify failed (${verify.code || 'no code'}): ${verify.error || 'unknown'}`);
        process.exit(1);
    }
    logger.info('SMTP verify succeeded (credentials accepted by server).');
}

main().catch((err) => {
    logger.error(err);
    process.exit(1);
});

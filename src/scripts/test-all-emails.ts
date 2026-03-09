/**
 * Test ALL email templates - sends each template to the specified email
 *
 * Usage:
 *   npx ts-node src/scripts/test-all-emails.ts
 *   npx ts-node src/scripts/test-all-emails.ts abdullahbinziad@gmail.com
 *
 * Uses .env for SMTP config. Sends to client email by default.
 */

import dotenv from 'dotenv';
import path from 'path';
import { sendTemplatedEmail } from '../modules/email/email.service';
import { TEMPLATE_KEYS } from '../modules/email/templates/registry';
import { PREVIEW_DATA } from '../modules/email/preview/mocks/preview-data';
import type { TemplateKey } from '../modules/email/templates/types';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const CLIENT_EMAIL = 'abdullahbinziad@gmail.com';

// Override customer name for client-facing emails
const CLIENT_NAME = 'Abdullah';

function getTestProps(key: TemplateKey): Record<string, unknown> {
    const base = { ...PREVIEW_DATA[key] };
    // Use client name for customer-facing templates
    if ('customerName' in base) {
        base.customerName = CLIENT_NAME;
    }
    return base;
}

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function runAllEmailTests() {
    const targetEmail = process.argv[2] || CLIENT_EMAIL;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  FlexoHost Email System - Full Template Test');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Target: ${targetEmail}`);
    console.log(`  SMTP:   ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    console.log(`  From:   ${process.env.EMAIL_FROM}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    for (const key of TEMPLATE_KEYS) {
        process.stdout.write(`  [${key.padEnd(35)}] `);
        try {
            const props = getTestProps(key);
            const result = await sendTemplatedEmail({
                to: targetEmail,
                templateKey: key,
                props: props as any,
            });

            if (result.success) {
                console.log('✅ Sent');
                passed++;
            } else {
                console.log(`❌ Failed: ${result.error}`);
                failed++;
            }
        } catch (err: any) {
            console.log(`❌ Error: ${err?.message || err}`);
            failed++;
        }

        // Small delay to avoid rate limiting (2 sec between emails)
        await sleep(2000);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  Result: ${passed} sent, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n  Check ${targetEmail} inbox (and spam folder) for all emails.\n`);

    process.exit(failed > 0 ? 1 : 0);
}

runAllEmailTests();

/**
 * One-time migration: remove dashboard/custom-SMTP fields left in MongoDB from older releases,
 * and drop obsolete permission id `settings:smtp` from roles.
 *
 * Run: npx ts-node src/scripts/migrate-unset-legacy-smtp-dashboard-fields.ts
 * Prod:  node dist/scripts/migrate-unset-legacy-smtp-dashboard-fields.js
 */

import mongoose from 'mongoose';
import config from '../config';
import logger from '../utils/logger';
import BillingSettings from '../modules/billing-settings/billing-settings.model';
import Role from '../modules/role/role.model';

const LEGACY_BILLING_UNSET: Record<string, 1> = {
    smtpUseCustom: 1,
    smtpHost: 1,
    smtpPort: 1,
    smtpUser: 1,
    smtpPassword: 1,
    smtpSecure: 1,
    smtpRequireTls: 1,
    smtpTlsRejectUnauthorized: 1,
    emailFrom: 1,
};

async function main(): Promise<void> {
    await mongoose.connect(config.mongodb.uri);
    logger.info('Connected to MongoDB');

    const billingRes = await BillingSettings.updateMany({}, { $unset: LEGACY_BILLING_UNSET }).exec();
    logger.info(`BillingSettings: matched ${billingRes.matchedCount}, modified ${billingRes.modifiedCount}`);

    const roleRes = await Role.updateMany({ permissions: 'settings:smtp' }, { $pull: { permissions: 'settings:smtp' } }).exec();
    logger.info(`Roles: removed settings:smtp where present (matched ${roleRes.matchedCount}, modified ${roleRes.modifiedCount})`);

    await mongoose.disconnect();
    logger.info('Done.');
}

main().catch((err) => {
    logger.error(err);
    process.exit(1);
});

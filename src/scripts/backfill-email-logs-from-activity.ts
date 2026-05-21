import mongoose from 'mongoose';
import config from '../config';
import ActivityLog from '../modules/activity-log/activity-log.model';
import EmailLog from '../modules/email/email-log.model';
import logger from '../utils/logger';

async function connectDB(): Promise<void> {
    await mongoose.connect(config.mongodb.uri);
    logger.info('MongoDB connected');
}

async function main(): Promise<void> {
    await connectDB();
    const logs = await ActivityLog.find({ category: 'email' }).sort({ createdAt: 1 }).lean();
    let created = 0;
    let skipped = 0;

    for (const log of logs as any[]) {
        const exists = await EmailLog.exists({ 'meta.activityLogId': log._id.toString() });
        if (exists) {
            skipped++;
            continue;
        }
        const meta = log.meta || {};
        await EmailLog.create({
            clientId: log.clientId,
            serviceId: log.serviceId || meta.serviceId,
            invoiceId: log.invoiceId || meta.invoiceId,
            domainId: log.domainId || meta.domainId,
            orderId: log.orderId || meta.orderId,
            ticketId: log.ticketId || meta.ticketId,
            sentBy: log.actorType === 'user' ? log.actorId || log.userId : undefined,
            actorType: log.actorType || 'system',
            source: log.source || 'system',
            status: log.status === 'failure' || log.type === 'email_failed' ? 'failed' : 'sent',
            to: meta.to || 'unknown',
            subject: meta.subject || log.message || 'Email',
            templateKey: meta.templateKey,
            emailType: meta.emailType || meta.reminderType || log.type,
            bodyPreview: meta.bodyPreview || meta.reminderType || log.message,
            error: meta.error,
            meta: { ...meta, activityLogId: log._id.toString(), backfilledFromActivityLog: true },
            createdAt: log.createdAt,
            updatedAt: log.createdAt,
        });
        created++;
    }

    logger.info(`Email log backfill complete. Created: ${created}, skipped: ${skipped}`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    logger.error('Email log backfill failed:', err);
    await mongoose.disconnect();
    process.exit(1);
});

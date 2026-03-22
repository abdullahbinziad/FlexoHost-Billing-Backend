import DomainServiceDetails from '../models/domain-details.model';
import DomainReminderLog from '../../domain/domain-reminder-log.model';
import { notificationProvider } from '../providers/notification.provider';
import { getBillingSettings } from '../../billing-settings/billing-settings.service';
import { auditLogSafe } from '../../activity-log/activity-log.service';
import tldService from '../../domain/tld/tld.service';
import logger from '../../../utils/logger';
import config from '../../../config';

const DEFAULT_CURRENCY = 'BDT';

async function getRenewalPriceForDomain(domainName: string, currency: string): Promise<string> {
    try {
        const parts = domainName.toLowerCase().split('.').filter(Boolean);
        if (parts.length < 2) return '0';
        const extension = `.${parts.slice(1).join('.')}`;
        let tldDoc: any = null;
        try {
            tldDoc = await tldService.getTLDByExtension(extension);
        } catch {
            return '0';
        }
        if (!tldDoc || !tldDoc.pricing?.length) return '0';
        const priceEntry = tldDoc.pricing.find((p: any) => (p.currency || '').toUpperCase() === currency.toUpperCase())
            || tldDoc.pricing[0];
        const oneYear = priceEntry?.['1'] || priceEntry?.[1];
        const renew = oneYear?.renew ?? oneYear?.register ?? 0;
        return String(renew);
    } catch {
        return '0';
    }
}

export class DomainExpiryReminderScheduler {
    async processDomainExpiryReminders() {
        const settings = await getBillingSettings();
        const reminderDays = settings.domainExpiryReminderDays ?? [90, 60, 30, 14, 7];
        const daysToCheck = reminderDays.filter((d) => d > 0);
        if (daysToCheck.length === 0) return { remindersSent: 0 };

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const origin = config.frontendUrl;

        let remindersSent = 0;

        for (const daysRemaining of daysToCheck) {
            const targetDate = new Date(startOfToday);
            targetDate.setDate(targetDate.getDate() + daysRemaining);
            const targetEnd = new Date(targetDate);
            targetEnd.setDate(targetEnd.getDate() + 1);

            const domains = await DomainServiceDetails.find({
                expiresAt: { $gte: targetDate, $lt: targetEnd }
            })
                .populate({ path: 'serviceId', select: 'clientId autoRenew', populate: { path: 'clientId', select: 'contactEmail user firstName lastName', populate: { path: 'user', select: 'email' } } })
                .lean()
                .exec();

            for (const domain of domains) {
                const reminderType = `DOMAIN_EXPIRY_${daysRemaining}`;
                const existing = await DomainReminderLog.findOne({
                    domainDetailsId: domain._id,
                    reminderType
                });
                if (existing) continue;

                const service = domain.serviceId as any;
                if (!service?.clientId) continue;

                const client = service.clientId;
                const clientEmail = client?.contactEmail || client?.user?.email;
                if (!clientEmail) {
                    logger.warn(`[DomainReminder] No email for domain ${domain.domainName}, skipping`);
                    continue;
                }

                const expiresAt = domain.expiresAt ? new Date(domain.expiresAt) : null;
                const expirationDate = expiresAt ? expiresAt.toLocaleDateString() : 'N/A';
                const customerName = client?.firstName || client?.lastName
                    ? `${client?.firstName || ''} ${client?.lastName || ''}`.trim()
                    : client?.contactEmail || 'Customer';
                const renewUrl = `${origin}/domains/${domain.domainName}/renew`;

                try {
                    const renewalPrice = await getRenewalPriceForDomain(domain.domainName, DEFAULT_CURRENCY);
                    const sent = await notificationProvider.sendEmail(
                        clientEmail,
                        `Domain Renewal Reminder - ${domain.domainName}`,
                        'domain.renewal_reminder',
                        {
                            domain: domain.domainName,
                            expirationDate,
                            daysRemaining,
                            renewalPrice,
                            currency: DEFAULT_CURRENCY,
                            autoRenewEnabled: service?.autoRenew ?? false,
                            renewUrl,
                            customerName,
                        }
                    );

                    if (sent) {
                        await DomainReminderLog.create({
                            domainDetailsId: domain._id,
                            reminderType
                        });
                        remindersSent++;
                        auditLogSafe({
                            message: `Domain expiry reminder sent to ${customerName} for ${domain.domainName} (${daysRemaining} days)`,
                            type: 'email_sent',
                            category: 'email',
                            actorType: 'system',
                            source: 'cron',
                            clientId: (client._id ?? client)?.toString?.(),
                            meta: { reminderType, domain: domain.domainName },
                        });
                    }
                } catch (err: any) {
                    if (err.code !== 11000) {
                        logger.error(`[DomainReminder] Error for ${domain.domainName}:`, err);
                    }
                }
            }
        }

        // Process expired domains (expiresAt < startOfToday) - send domain.expired_notice
        const expiredDomains = await DomainServiceDetails.find({
            expiresAt: { $lt: startOfToday }
        })
            .populate({ path: 'serviceId', select: 'clientId', populate: { path: 'clientId', select: 'contactEmail user firstName lastName', populate: { path: 'user', select: 'email' } } })
            .lean()
            .exec();

        let expiredNoticesSent = 0;
        const reminderTypeExpired = 'DOMAIN_EXPIRED';

        for (const domain of expiredDomains) {
            const existing = await DomainReminderLog.findOne({
                domainDetailsId: domain._id,
                reminderType: reminderTypeExpired
            });
            if (existing) continue;

            const service = domain.serviceId as any;
            if (!service?.clientId) continue;

            const client = service.clientId;
            const clientEmail = client?.contactEmail || client?.user?.email;
            if (!clientEmail) {
                logger.warn(`[DomainReminder] No email for expired domain ${domain.domainName}, skipping`);
                continue;
            }

            const expiresAt = domain.expiresAt ? new Date(domain.expiresAt) : null;
            const expirationDate = expiresAt ? expiresAt.toLocaleDateString() : 'N/A';
            const customerName = client?.firstName || client?.lastName
                ? `${client?.firstName || ''} ${client?.lastName || ''}`.trim()
                : client?.contactEmail || 'Customer';
            const restoreUrl = `${origin}/domains/${domain.domainName}/renew`;

            try {
                const sent = await notificationProvider.sendEmail(
                    clientEmail,
                    `Domain Expired - ${domain.domainName}`,
                    'domain.expired_notice',
                    {
                        customerName,
                        domain: domain.domainName,
                        expirationDate,
                        statusLabel: 'Expired',
                        restoreUrl,
                    }
                );

                if (sent) {
                    await DomainReminderLog.create({
                        domainDetailsId: domain._id,
                        reminderType: reminderTypeExpired
                    });
                    expiredNoticesSent++;
                    auditLogSafe({
                        message: `Domain expired notice sent to ${customerName} for ${domain.domainName}`,
                        type: 'email_sent',
                        category: 'email',
                        actorType: 'system',
                        source: 'cron',
                        clientId: (client._id ?? client)?.toString?.(),
                        meta: { reminderType: reminderTypeExpired, domain: domain.domainName },
                    });
                }
            } catch (err: any) {
                if (err.code !== 11000) {
                    logger.error(`[DomainReminder] Error sending expired notice for ${domain.domainName}:`, err);
                }
            }
        }

        logger.info(`[DomainReminder] Sent ${remindersSent} domain expiry reminders, ${expiredNoticesSent} expired notices.`);
        return { remindersSent, expiredNoticesSent };
    }
}

export default new DomainExpiryReminderScheduler();

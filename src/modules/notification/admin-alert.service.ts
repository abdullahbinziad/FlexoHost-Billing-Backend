import type { Types } from 'mongoose';
import config from '../../config';
import logger from '../../utils/logger';
import { auditLogSafe } from '../activity-log/activity-log.service';
import type { AuditSeverity, AuditSource } from '../activity-log/activity-log.interface';
import * as emailService from '../email/email.service';
import type { EmailLogSource } from '../email/email-log.model';
import notificationService from './notification.service';
import type { NotificationCategory } from './notification.interface';
import { adminAlertRecipientService } from './admin-alert-recipient.service';

interface AdminAlertEmail {
    subject: string;
    html: string;
    text?: string;
}

export interface AdminAlertInput {
    permission: string;
    category: NotificationCategory;
    title: string;
    message: string;
    linkPath?: string;
    linkLabel?: string;
    severity?: AuditSeverity;
    source?: AuditSource;
    email?: AdminAlertEmail;
    clientId?: string | Types.ObjectId;
    serviceId?: string | Types.ObjectId;
    invoiceId?: string | Types.ObjectId;
    domainId?: string | Types.ObjectId;
    orderId?: string | Types.ObjectId;
    meta?: Record<string, unknown>;
}

function toObjectId(value?: string | Types.ObjectId): Types.ObjectId | undefined {
    if (!value) return undefined;
    return value as Types.ObjectId;
}

function toStringId(value?: string | Types.ObjectId): string | undefined {
    return value?.toString?.();
}

function defaultHtml(input: AdminAlertInput): string {
    const frontend = config.frontendUrl.replace(/\/$/, '');
    const link = input.linkPath ? `${frontend}${input.linkPath.startsWith('/') ? input.linkPath : `/${input.linkPath}`}` : frontend;
    return [
        `<p><strong>${escapeHtml(input.title)}</strong></p>`,
        `<p>${escapeHtml(input.message)}</p>`,
        `<p><strong>Severity:</strong> ${escapeHtml(input.severity || 'medium')}</p>`,
        `<p><a href="${escapeHtml(link)}">${escapeHtml(input.linkLabel || 'Open admin panel')}</a></p>`,
    ].join('');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class AdminAlertService {
    async notify(input: AdminAlertInput): Promise<{ inAppCount: number; emailCount: number; recipientCount: number }> {
        const recipients = await adminAlertRecipientService.resolveByPermission(input.permission);
        if (recipients.length === 0) {
            logger.warn(`[AdminAlert] No role recipients for ${input.permission}: ${input.title}`);
            return { inAppCount: 0, emailCount: 0, recipientCount: 0 };
        }

        let inAppCount = 0;
        let emailCount = 0;
        for (const recipient of recipients) {
            try {
                await notificationService.create({
                    userId: recipient.userId,
                    clientId: toObjectId(input.clientId),
                    category: input.category,
                    title: input.title,
                    message: input.message,
                    linkPath: input.linkPath,
                    linkLabel: input.linkLabel,
                    meta: {
                        ...input.meta,
                        permission: input.permission,
                        severity: input.severity || 'medium',
                    },
                });
                inAppCount++;
            } catch (err: any) {
                logger.warn(`[AdminAlert] In-app notification failed for ${recipient.email}: ${err?.message || err}`);
            }

            if (input.email) {
                try {
                    const result = await emailService.sendEmail({
                        to: recipient.email,
                        subject: input.email.subject,
                        html: input.email.html || defaultHtml(input),
                        text: input.email.text || input.message,
                        logContext: {
                            clientId: toStringId(input.clientId),
                            serviceId: toStringId(input.serviceId),
                            invoiceId: toStringId(input.invoiceId),
                            domainId: toStringId(input.domainId),
                            orderId: toStringId(input.orderId),
                            source: (input.source || 'system') as EmailLogSource,
                            actorType: 'system',
                            emailType: `admin.${input.permission}`,
                            bodyPreview: input.message,
                            meta: {
                                ...input.meta,
                                permission: input.permission,
                                severity: input.severity || 'medium',
                            },
                        },
                    });
                    if (result.success) emailCount++;
                } catch (err: any) {
                    logger.warn(`[AdminAlert] Email alert failed for ${recipient.email}: ${err?.message || err}`);
                }
            }
        }

        auditLogSafe({
            message: `Admin alert sent: ${input.title}`,
            type: 'automation_summary',
            category: input.category === 'automation' ? 'automation' : 'email',
            actorType: 'system',
            source: input.source || 'system',
            status: 'success',
            severity: input.severity || 'medium',
            clientId: toStringId(input.clientId),
            serviceId: toStringId(input.serviceId),
            invoiceId: toStringId(input.invoiceId),
            domainId: toStringId(input.domainId),
            orderId: toStringId(input.orderId),
            meta: {
                ...input.meta,
                permission: input.permission,
                recipientCount: recipients.length,
                inAppCount,
                emailCount,
            },
        });

        return { inAppCount, emailCount, recipientCount: recipients.length };
    }
}

export const adminAlertService = new AdminAlertService();

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import Client from '../client/client.model';
import emailService from './email.service';
import { buildCustomEmailHtml } from './build-custom-email';
import { isTransportConfigured, verifySmtpConnection } from './transport/nodemailer.transport';
import { resolveEmailSmtpConfig } from './smtp';
import { auditLogSafe } from '../activity-log/activity-log.service';

const MAX_RECIPIENTS = 100;

function personalizeMessage(message: string, firstName?: string, lastName?: string): string {
    let out = message;
    const first = firstName || '';
    const last = lastName || '';
    out = out.replace(/\{\{firstName\}\}/g, first);
    out = out.replace(/\{\{lastName\}\}/g, last);
    return out;
}

class EmailController {
    /**
     * POST /email/send-bulk
     * Send the same email to multiple clients. Admin/staff only.
     */
    sendBulk = catchAsync(async (req: AuthRequest, res: Response) => {
        const { clientIds, subject, message, html } = req.body as {
            clientIds: string[];
            subject: string;
            message: string;
            html?: string;
        };

        if (!clientIds?.length) {
            return ApiResponse.badRequest(res, 'At least one client is required');
        }

        if (clientIds.length > MAX_RECIPIENTS) {
            return ApiResponse.badRequest(res, `Maximum ${MAX_RECIPIENTS} recipients per request`);
        }

        if (!(await isTransportConfigured())) {
            return ApiResponse.badRequest(
                res,
                'SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in the API environment.'
            );
        }

        const verify = await verifySmtpConnection();
        if (!verify.ok) {
            const resolved = await resolveEmailSmtpConfig();
            const detail = verify.error || 'SMTP verification failed';
            const isAuth = /535|authentication|auth|invalid login|credentials|533|5\.7\.8/i.test(detail);
            return ApiResponse.error(
                res,
                503,
                isAuth
                    ? 'SMTP authentication failed before sending. The mail server rejected the username or password.'
                    : 'SMTP connection failed before sending.',
                {
                    code: verify.code,
                    detail,
                    smtpSource: resolved.source,
                    smtpHost: resolved.smtp.host,
                    smtpPort: resolved.smtp.port,
                    hint: isAuth
                        ? 'Update SMTP_USER and SMTP_PASSWORD in the API environment. For Gmail/Google Workspace with 2FA, use an App Password; SMTP user is usually the full mailbox address.'
                        : 'This is usually not a wrong password: the API could not complete TCP/TLS to the mail server. Cloud/VPS providers often block outbound SMTP (587/465) or require a relay; your laptop does not. Confirm the production API loads the same SMTP_* as local, host/port match the provider (587+STARTTLS vs 465+SSL), and egress/firewall allows that port. See the error detail above (e.g. ECONNREFUSED, ETIMEDOUT, certificate).',
                }
            );
        }

        const senderLabel = req.user?.email || 'Support Team';
        const results: Array<{ clientId: string; email: string | null; success: boolean; error?: string }> = [];
        let sent = 0;
        let failed = 0;

        const clients = await Client.find({ _id: { $in: clientIds.map((id) => new mongoose.Types.ObjectId(id)) } })
            .populate('user', 'email')
            .lean();

        const clientMap = new Map(clients.map((c: any) => [c._id.toString(), c]));

        for (const clientId of clientIds) {
            const client = clientMap.get(clientId) as any;
            if (!client) {
                results.push({ clientId, email: null, success: false, error: 'Client not found' });
                failed++;
                continue;
            }

            const recipientEmail = client.contactEmail || client.user?.email;
            if (!recipientEmail) {
                results.push({ clientId, email: null, success: false, error: 'No email address' });
                failed++;
                continue;
            }

            const clientName = [client.firstName, client.lastName].filter(Boolean).join(' ').trim() || 'Client';
            const personalizedMessage = personalizeMessage(message || '', client.firstName, client.lastName);
            const htmlBody = html
                ? buildCustomEmailHtml({
                      clientName,
                      message: personalizeMessage(html, client.firstName, client.lastName),
                      senderLabel,
                      bodyIsHtml: true,
                  })
                : buildCustomEmailHtml({ clientName, message: personalizedMessage, senderLabel });

            const result = await emailService.sendEmail({
                to: recipientEmail,
                subject: subject || '',
                text: personalizedMessage,
                html: htmlBody,
            });

            if (result.success) {
                results.push({ clientId, email: recipientEmail, success: true });
                sent++;

                const bodyPreview = (personalizedMessage || '').length > 500
                    ? `${(personalizedMessage || '').slice(0, 500)}...`
                    : personalizedMessage || '';
                auditLogSafe({
                    message: `Bulk email sent to ${clientName}`,
                    type: 'email_sent',
                    category: 'email',
                    actorType: 'user',
                    actorId: req.user?._id?.toString?.(),
                    source: 'manual',
                    status: 'success',
                    clientId,
                    targetType: 'client',
                    targetId: clientId,
                    meta: {
                        emailType: 'bulk_custom',
                        subject,
                        to: recipientEmail,
                        bodyPreview,
                    },
                });
            } else {
                results.push({
                    clientId,
                    email: recipientEmail,
                    success: false,
                    error: result.error || 'Send failed',
                });
                failed++;

                auditLogSafe({
                    message: `Bulk email failed for ${clientName}`,
                    type: 'email_failed',
                    category: 'email',
                    actorType: 'user',
                    actorId: req.user?._id?.toString?.(),
                    source: 'manual',
                    status: 'failure',
                    clientId,
                    targetType: 'client',
                    targetId: clientId,
                    meta: {
                        emailType: 'bulk_custom',
                        subject,
                        to: recipientEmail,
                        error: result.error,
                    },
                });
            }
        }

        return ApiResponse.ok(res, `Sent to ${sent} of ${clientIds.length} recipients`, {
            sent,
            failed,
            total: clientIds.length,
            results,
        });
    });

}

export default new EmailController();

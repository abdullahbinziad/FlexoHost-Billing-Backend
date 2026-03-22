/**
 * Fire-and-forget login alert email after successful password or OAuth sign-in.
 * Throttled per user (config.loginAlert.throttleMs) to avoid inbox noise.
 */

import config from '../../config';
import logger from '../../utils/logger';
import emailService from '../email/email.service';

const lastSuccessAlertAt = new Map<string, number>();

function customerNameFromUser(user: any): string {
    const c = user?.client;
    if (c && (c.firstName || c.lastName)) {
        return [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    }
    return user?.email || 'Customer';
}

/**
 * Schedule login alert email (non-blocking). Safe to call when user is logged in.
 */
export function scheduleLoginAlertEmail(args: {
    user: any;
    ipAddress: string;
    userAgent: string;
    method: 'password' | 'google';
}): void {
    if (!config.loginAlert.successEnabled) {
        return;
    }
    const id = args.user?._id?.toString?.() || args.user?.id;
    const email = args.user?.email;
    if (!id || !email) {
        return;
    }

    const now = Date.now();
    const throttleMs = config.loginAlert.throttleMs;
    const prev = lastSuccessAlertAt.get(id);
    if (prev !== undefined && now - prev < throttleMs) {
        return;
    }
    lastSuccessAlertAt.set(id, now);

    void (async () => {
        try {
            const loginTime =
                new Date().toLocaleString('en-GB', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                }) + ' (UTC)';
            const signInMethod = args.method === 'google' ? 'Google' : 'Email & password';
            await emailService.sendLoginAlertEmail(email, {
                customerName: customerNameFromUser(args.user),
                loginTime,
                ipAddress: args.ipAddress || 'Unknown',
                userAgent: args.userAgent || 'Unknown',
                signInMethod,
            });
        } catch (e) {
            logger.warn('[Login alert] Failed to send login notification email:', e);
        }
    })();
}

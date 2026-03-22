import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth';

/** Limit SMTP test emails per user to reduce abuse if a session is compromised. */
export const smtpTestRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const u = (req as AuthRequest).user as { _id?: { toString(): string }; id?: string } | undefined;
        const id = u?._id?.toString?.() || u?.id;
        if (id) return `smtp-test:user:${id}`;
        return `smtp-test:ip:${req.ip}`;
    },
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many SMTP test requests. Please wait before trying again.',
        });
    },
});

import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth';

/** Limit POST /email/test per user to reduce abuse if a session is compromised. */
export const emailTestRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const u = (req as AuthRequest).user as { _id?: { toString(): string }; id?: string } | undefined;
        const id = u?._id?.toString?.() || u?.id;
        if (id) return `email-test:user:${id}`;
        return `email-test:ip:${req.ip}`;
    },
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many test email requests. Please wait before trying again.',
        });
    },
});

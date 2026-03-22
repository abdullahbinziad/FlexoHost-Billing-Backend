import { body } from 'express-validator';

export const sendBulkEmailValidation = [
    body('clientIds')
        .isArray({ min: 1 })
        .withMessage('At least one client ID is required')
        .custom((ids: unknown[]) => {
            if (!Array.isArray(ids)) return false;
            return ids.every((id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id));
        })
        .withMessage('Each client ID must be a valid MongoDB ObjectId'),
    body('subject')
        .trim()
        .notEmpty()
        .withMessage('Subject is required')
        .isLength({ max: 200 })
        .withMessage('Subject cannot exceed 200 characters'),
    body('message')
        .trim()
        .notEmpty()
        .withMessage('Message is required')
        .isLength({ max: 10000 })
        .withMessage('Message cannot exceed 10000 characters'),
    body('html')
        .optional()
        .trim()
        .isLength({ max: 50000 })
        .withMessage('HTML body cannot exceed 50000 characters'),
];

/** POST /email/test — send a single test message to verify SMTP in production */
export const testSmtpValidation = [
    body('to').trim().isEmail().withMessage('Valid recipient email (to) is required'),
];

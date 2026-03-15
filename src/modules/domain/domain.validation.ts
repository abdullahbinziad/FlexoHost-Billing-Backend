import { body } from 'express-validator';

/** Domain name format: label.tld (e.g. example.com). Labels: alphanumeric and hyphens, 1-63 chars. */
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const registerDomainValidation = [
    body('domain')
        .trim()
        .notEmpty()
        .withMessage('Domain is required')
        .matches(DOMAIN_REGEX)
        .withMessage('Invalid domain format'),
    body('duration')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Duration must be 1–10 years')
        .toInt(),
    body('allowDirectProvisioning')
        .custom((v) => v === true)
        .withMessage('Direct provisioning requires explicit override'),
    body('reason')
        .trim()
        .notEmpty()
        .withMessage('A reason is required for direct registrar actions')
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters'),
];

export const transferDomainValidation = [
    body('domain')
        .trim()
        .notEmpty()
        .withMessage('Domain is required')
        .matches(DOMAIN_REGEX)
        .withMessage('Invalid domain format'),
    body('authCode')
        .trim()
        .notEmpty()
        .withMessage('EPP/auth code is required for transfer')
        .isLength({ min: 6, max: 64 })
        .withMessage('Auth code must be 6–64 characters'),
    body('allowDirectProvisioning')
        .custom((v) => v === true)
        .withMessage('Direct provisioning requires explicit override'),
    body('reason')
        .trim()
        .notEmpty()
        .withMessage('A reason is required for direct registrar actions')
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters'),
];

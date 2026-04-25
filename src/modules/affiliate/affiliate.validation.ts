import { body, param } from 'express-validator';

export const redeemAffiliateCreditValidation = [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero'),
    body('currency').optional().isString().trim().isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code'),
];

export const createAffiliatePayoutRequestValidation = [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero'),
    body('currency').optional().isString().trim().isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code'),
    body('payoutDetails.method').optional().isString().trim(),
    body('payoutDetails.accountName').optional().isString().trim(),
    body('payoutDetails.accountNumber').optional().isString().trim(),
    body('payoutDetails.provider').optional().isString().trim(),
    body('payoutDetails.notes').optional().isString().trim(),
];

export const reviewAffiliatePayoutValidation = [
    param('id').isMongoId().withMessage('Invalid payout request id'),
    body('action').isIn(['approve', 'reject', 'mark_paid']).withMessage('Invalid payout action'),
    body('notes').optional().isString().trim(),
];

export const updateAffiliateDefaultSettingsValidation = [
    body('defaultCommissionRate')
        .isFloat({ min: 0, max: 100 })
        .withMessage('Default commission rate must be between 0 and 100'),
    body('defaultReferralDiscountRate')
        .isFloat({ min: 0, max: 100 })
        .withMessage('Default buyer discount rate must be between 0 and 100'),
    body('defaultPayoutThreshold')
        .isFloat({ min: 0 })
        .withMessage('Default payout threshold must be zero or more'),
    body('commissionApprovalDelayDays')
        .isInt({ min: 0, max: 365 })
        .withMessage('Commission approval delay must be between 0 and 365 days'),
];

export const updateAffiliateClientSettingsValidation = [
    param('clientId').isMongoId().withMessage('Invalid client id'),
    body('commissionRate')
        .isFloat({ min: 0, max: 100 })
        .withMessage('Commission rate must be between 0 and 100'),
    body('referralDiscountRate')
        .isFloat({ min: 0, max: 100 })
        .withMessage('Buyer discount rate must be between 0 and 100'),
    body('payoutThreshold')
        .isFloat({ min: 0 })
        .withMessage('Payout threshold must be zero or more'),
];

export const updateAffiliateClientStatusValidation = [
    param('clientId').isMongoId().withMessage('Invalid client id'),
    body('status').isIn(['active', 'paused']).withMessage('Affiliate status must be active or paused'),
];

export const updateMyAffiliateReferralCodeValidation = [
    body('referralCode')
        .isString()
        .trim()
        .matches(/^[A-Za-z0-9]{4,20}$/)
        .withMessage('Referral code must be 4-20 letters or numbers'),
];

export const updateClientAffiliateReferralCodeValidation = [
    param('clientId').isMongoId().withMessage('Invalid client id'),
    body('referralCode')
        .isString()
        .trim()
        .matches(/^[A-Za-z0-9]{4,20}$/)
        .withMessage('Referral code must be 4-20 letters or numbers'),
];

import { body } from 'express-validator';

export const bulkOrderIdsValidation = [
    body('orderIds')
        .isArray({ min: 1 })
        .withMessage('At least one order ID is required'),
    body('orderIds.*')
        .isMongoId()
        .withMessage('Invalid order ID'),
];

export const bulkSendMessageValidation = [
    body('orderIds')
        .isArray({ min: 1 })
        .withMessage('At least one order ID is required'),
    body('orderIds.*')
        .isMongoId()
        .withMessage('Invalid order ID'),
    body('subject')
        .trim()
        .notEmpty()
        .withMessage('Subject is required')
        .isLength({ max: 200 })
        .withMessage('Subject must be at most 200 characters'),
    body('message')
        .trim()
        .notEmpty()
        .withMessage('Message is required')
        .isLength({ max: 10000 })
        .withMessage('Message must be at most 10000 characters'),
];

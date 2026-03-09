import { body, param, query } from 'express-validator';
import { SUPPORTED_CURRENCIES } from '../../config/currency.config';

export const createPromotionValidation = [
    body('code')
        .trim()
        .notEmpty()
        .withMessage('Coupon code is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Code must be between 2 and 50 characters'),

    body('name')
        .trim()
        .notEmpty()
        .withMessage('Promotion name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),

    body('type')
        .notEmpty()
        .withMessage('Discount type is required')
        .isIn(['percent', 'fixed'])
        .withMessage('Type must be percent or fixed'),

    body('value')
        .notEmpty()
        .withMessage('Discount value is required')
        .isFloat({ min: 0 })
        .withMessage('Value must be a positive number'),

    body('currency')
        .optional()
        .trim()
        .isIn([...SUPPORTED_CURRENCIES])
        .withMessage(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`),

    body('minOrderAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Minimum order amount must be non-negative'),

    body('maxDiscountAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Maximum discount amount must be non-negative'),

    body('startDate')
        .notEmpty()
        .withMessage('Start date is required')
        .isISO8601()
        .withMessage('Invalid start date'),

    body('endDate')
        .notEmpty()
        .withMessage('End date is required')
        .isISO8601()
        .withMessage('Invalid end date')
        .custom((end, { req }) => {
            if (req.body?.startDate && new Date(end) <= new Date(req.body.startDate)) {
                throw new Error('End date must be after start date');
            }
            return true;
        }),

    body('usageLimit')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Usage limit must be a non-negative integer'),

    body('usagePerClient')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Usage per client must be a non-negative integer'),

    body('firstOrderOnly')
        .optional()
        .isBoolean()
        .withMessage('firstOrderOnly must be a boolean'),

    body('productIds')
        .optional()
        .isArray()
        .withMessage('productIds must be an array'),

    body('productIds.*')
        .optional()
        .isMongoId()
        .withMessage('Invalid product ID'),

    body('productTypes')
        .optional()
        .isArray()
        .withMessage('productTypes must be an array'),

    body('productBillingCycles')
        .optional()
        .isArray()
        .withMessage('productBillingCycles must be an array'),

    body('productBillingCycles.*')
        .optional()
        .trim()
        .isIn(['monthly', 'quarterly', 'semiAnnually', 'annually', 'biennially', 'triennially'])
        .withMessage('Invalid product billing cycle'),

    body('domainTlds')
        .optional()
        .isArray()
        .withMessage('domainTlds must be an array'),

    body('domainTlds.*')
        .optional()
        .trim()
        .isLength({ min: 2 })
        .withMessage('Invalid TLD'),

    body('domainBillingCycles')
        .optional()
        .isArray()
        .withMessage('domainBillingCycles must be an array'),

    body('domainBillingCycles.*')
        .optional()
        .trim()
        .isIn(['annually', 'biennially', 'triennially'])
        .withMessage('Invalid domain billing cycle'),

    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean'),
];

export const updatePromotionValidation = [
    param('id')
        .notEmpty()
        .withMessage('Promotion ID is required')
        .isMongoId()
        .withMessage('Invalid promotion ID'),

    body('code')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Code must be between 2 and 50 characters'),

    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),

    body('type')
        .optional()
        .isIn(['percent', 'fixed'])
        .withMessage('Type must be percent or fixed'),

    body('value')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Value must be a positive number'),

    body('currency')
        .optional()
        .trim()
        .isIn([...SUPPORTED_CURRENCIES])
        .withMessage(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`),

    body('minOrderAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Minimum order amount must be non-negative'),

    body('maxDiscountAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Maximum discount amount must be non-negative'),

    body('startDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid start date'),

    body('endDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid end date'),

    body('usageLimit')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Usage limit must be a non-negative integer'),

    body('usagePerClient')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Usage per client must be a non-negative integer'),

    body('firstOrderOnly')
        .optional()
        .isBoolean()
        .withMessage('firstOrderOnly must be a boolean'),

    body('productIds')
        .optional()
        .isArray()
        .withMessage('productIds must be an array'),

    body('productTypes')
        .optional()
        .isArray()
        .withMessage('productTypes must be an array'),

    body('productBillingCycles')
        .optional()
        .isArray()
        .withMessage('productBillingCycles must be an array'),

    body('productBillingCycles.*')
        .optional()
        .trim()
        .isIn(['monthly', 'quarterly', 'semiAnnually', 'annually', 'biennially', 'triennially'])
        .withMessage('Invalid product billing cycle'),

    body('domainTlds')
        .optional()
        .isArray()
        .withMessage('domainTlds must be an array'),

    body('domainTlds.*')
        .optional()
        .trim()
        .isLength({ min: 2 })
        .withMessage('Invalid TLD'),

    body('domainBillingCycles')
        .optional()
        .isArray()
        .withMessage('domainBillingCycles must be an array'),

    body('domainBillingCycles.*')
        .optional()
        .trim()
        .isIn(['annually', 'biennially', 'triennially'])
        .withMessage('Invalid domain billing cycle'),

    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean'),
];

export const getPromotionValidation = [
    param('id')
        .notEmpty()
        .withMessage('Promotion ID is required')
        .isMongoId()
        .withMessage('Invalid promotion ID'),
];

export const deletePromotionValidation = [
    param('id')
        .notEmpty()
        .withMessage('Promotion ID is required')
        .isMongoId()
        .withMessage('Invalid promotion ID'),
];

export const toggleActiveValidation = [
    param('id')
        .notEmpty()
        .withMessage('Promotion ID is required')
        .isMongoId()
        .withMessage('Invalid promotion ID'),

    body('isActive')
        .notEmpty()
        .withMessage('isActive is required')
        .isBoolean()
        .withMessage('isActive must be a boolean'),
];

export const getPromotionsQueryValidation = [
    query('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean'),

    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 500 })
        .withMessage('Limit must be between 1 and 500'),

    query('search')
        .optional()
        .trim(),
];

export const validateCouponValidation = [
    body('code')
        .trim()
        .notEmpty()
        .withMessage('Coupon code is required'),

    body('subtotal')
        .notEmpty()
        .withMessage('Subtotal is required')
        .isFloat({ min: 0 })
        .withMessage('Subtotal must be a positive number'),

    body('currency')
        .optional()
        .trim()
        .isIn([...SUPPORTED_CURRENCIES])
        .withMessage(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`),

    body('clientId')
        .optional()
        .isMongoId()
        .withMessage('Invalid client ID'),

    body('productIds')
        .optional()
        .isArray()
        .withMessage('productIds must be an array'),

    body('productTypes')
        .optional()
        .isArray()
        .withMessage('productTypes must be an array'),

    body('productBillingCycle')
        .optional()
        .trim()
        .isIn(['monthly', 'quarterly', 'semiAnnually', 'annually', 'biennially', 'triennially'])
        .withMessage('Invalid product billing cycle'),

    body('domainTlds')
        .optional()
        .isArray()
        .withMessage('domainTlds must be an array'),

    body('domainBillingCycle')
        .optional()
        .trim()
        .isIn(['annually', 'biennially', 'triennially'])
        .withMessage('Invalid domain billing cycle'),

    body('isFirstOrder')
        .optional()
        .isBoolean()
        .withMessage('isFirstOrder must be a boolean'),
];

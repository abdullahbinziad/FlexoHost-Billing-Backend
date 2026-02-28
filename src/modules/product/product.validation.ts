import { body, param, query } from 'express-validator';

/**
 * Validation for creating a product
 */
export const createProductValidation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Product name is required')
        .isLength({ min: 3, max: 100 })
        .withMessage('Product name must be between 3 and 100 characters'),

    body('type')
        .notEmpty()
        .withMessage('Product type is required')
        .isIn(['hosting', 'vps', 'domain', 'ssl'])
        .withMessage('Product type must be one of: hosting, vps, domain, ssl'),

    body('group')
        .trim()
        .notEmpty()
        .withMessage('Product group is required'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),

    body('paymentType')
        .notEmpty()
        .withMessage('Payment type is required')
        .isIn(['free', 'one-time', 'recurring'])
        .withMessage('Payment type must be one of: free, one-time, recurring'),

    body('pricing')
        .optional()
        .isArray({ min: 1 })
        .withMessage('At least one currency pricing is required for non-free products'),

    body('pricing.*.currency')
        .optional()
        .isIn(['BDT', 'USD', 'EUR', 'GBP'])
        .withMessage('Currency must be one of: BDT, USD, EUR, GBP'),

    body('pricing.*.monthly.price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Monthly price must be a positive number'),

    body('pricing.*.monthly.setupFee')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Setup fee must be a positive number'),

    body('pricing.*.monthly.renewPrice')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Renew price must be a positive number'),

    body('pricing.*.monthly.enable')
        .optional()
        .isBoolean()
        .withMessage('Enable must be a boolean'),

    body('features')
        .optional()
        .isArray({ max: 50 })
        .withMessage('Cannot have more than 50 features'),

    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a positive integer'),

    body('module.name')
        .optional()
        .isIn(['cpanel', 'directadmin', 'plesk', 'virtualizor', 'none'])
        .withMessage('Module name must be one of: cpanel, directadmin, plesk, virtualizor, none'),

    body('module.serverGroup')
        .optional()
        .trim(),

    body('module.packageName')
        .optional()
        .trim(),

    body('freeDomain.enabled')
        .optional()
        .isBoolean()
        .withMessage('Free domain enabled must be a boolean'),

    body('freeDomain.type')
        .optional()
        .isIn(['none', 'once', 'recurring'])
        .withMessage('Free domain type must be one of: none, once, recurring'),

    body('freeDomain.paymentTerms')
        .optional()
        .isArray()
        .withMessage('Payment terms must be an array'),

    body('freeDomain.tlds')
        .optional()
        .isArray()
        .withMessage('TLDs must be an array'),

    body('isHidden')
        .optional()
        .isBoolean()
        .withMessage('isHidden must be a boolean'),
];

/**
 * Validation for updating a product
 */
export const updateProductValidation = [
    param('id')
        .notEmpty()
        .withMessage('Product ID is required')
        .isMongoId()
        .withMessage('Invalid product ID'),

    body('name')
        .optional()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Product name must be between 3 and 100 characters'),

    body('type')
        .optional()
        .isIn(['hosting', 'vps', 'domain', 'ssl'])
        .withMessage('Product type must be one of: hosting, vps, domain, ssl'),

    body('group')
        .optional()
        .trim(),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),

    body('paymentType')
        .optional()
        .isIn(['free', 'one-time', 'recurring'])
        .withMessage('Payment type must be one of: free, one-time, recurring'),

    body('pricing')
        .optional()
        .isArray()
        .withMessage('Pricing must be an array'),

    body('features')
        .optional()
        .isArray({ max: 50 })
        .withMessage('Cannot have more than 50 features'),

    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a positive integer'),

    body('isHidden')
        .optional()
        .isBoolean()
        .withMessage('isHidden must be a boolean'),
];

/**
 * Validation for getting a single product
 */
export const getProductValidation = [
    param('id')
        .notEmpty()
        .withMessage('Product ID is required')
        .custom((value) => {
            // Check if it's a valid MongoID
            const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
            // Check if it's a 6-digit number
            const isPid = /^\d{6}$/.test(value);

            if (!isMongoId && !isPid) {
                throw new Error('Invalid product ID (must be MongoID or 6-digit PID)');
            }
            return true;
        }),
];

/**
 * Validation for deleting a product
 */
export const deleteProductValidation = [
    param('id')
        .notEmpty()
        .withMessage('Product ID is required')
        .isMongoId()
        .withMessage('Invalid product ID'),
];

/**
 * Validation for toggling product visibility
 */
export const toggleVisibilityValidation = [
    param('id')
        .notEmpty()
        .withMessage('Product ID is required')
        .isMongoId()
        .withMessage('Invalid product ID'),

    body('isHidden')
        .notEmpty()
        .withMessage('isHidden is required')
        .isBoolean()
        .withMessage('isHidden must be a boolean'),
];

/**
 * Validation for query parameters
 */
export const getProductsQueryValidation = [
    query('type')
        .optional()
        .isIn(['hosting', 'vps', 'domain', 'ssl'])
        .withMessage('Product type must be one of: hosting, vps, domain, ssl'),

    query('group')
        .optional()
        .trim(),

    query('isHidden')
        .optional()
        .isBoolean()
        .withMessage('isHidden must be a boolean'),

    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),

    query('sort')
        .optional()
        .trim(),
];

/**
 * Validation for search
 */
export const searchProductsValidation = [
    query('q')
        .notEmpty()
        .withMessage('Search query is required')
        .trim()
        .isLength({ min: 2 })
        .withMessage('Search query must be at least 2 characters'),
];

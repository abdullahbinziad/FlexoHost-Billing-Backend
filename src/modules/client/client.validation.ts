import { body, param, query } from 'express-validator';

export const registerClientValidation = [
    // User data validation
    body('userData.email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('userData.password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage(
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),

    body('userData.username').optional().trim().isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters'),

    // Client data validation
    body('clientData.firstName')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

    body('clientData.lastName')
        .trim()
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

    body('clientData.companyName')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name cannot exceed 100 characters'),

    body('clientData.contactEmail')
        .optional()
        .trim()
        .isEmail()
        .withMessage('Please provide a valid contact email')
        .normalizeEmail(),

    // Address validation
    body('clientData.address.street').optional().trim(),
    body('clientData.address.city').optional().trim(),
    body('clientData.address.state').optional().trim(),
    body('clientData.address.postCode').optional().trim(),
    body('clientData.address.country').optional().trim(),

    body('clientData.phoneNumber')
        .optional()
        .isMobilePhone('any')
        .withMessage('Please provide a valid phone number'),

    body('clientData.avatar')
        .optional()
        .isString()
        .withMessage('Avatar must be a string'),
];

export const updateClientValidation = [
    body('firstName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

    body('lastName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

    body('companyName')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name cannot exceed 100 characters'),

    body('contactEmail')
        .optional()
        .trim()
        .isEmail()
        .withMessage('Please provide a valid contact email')
        .normalizeEmail(),

    body('address.street').optional().trim(),
    body('address.city').optional().trim(),
    body('address.state').optional().trim(),
    body('address.postCode').optional().trim(),
    body('address.country').optional().trim(),

    body('phoneNumber')
        .optional()
        .isMobilePhone('any')
        .withMessage('Please provide a valid phone number'),

    body('avatar')
        .optional()
        .isString()
        .withMessage('Avatar must be a string'),
];

/** Required business/contact details before the account is considered complete (welcome email sent here). */
export const completeProfileValidation = [
    body('companyName')
        .trim()
        .notEmpty()
        .withMessage('Company name is required')
        .isLength({ max: 100 })
        .withMessage('Company name cannot exceed 100 characters'),
    body('phoneNumber')
        .trim()
        .notEmpty()
        .withMessage('Phone number is required')
        .isMobilePhone('any')
        .withMessage('Please provide a valid phone number'),
    body('address.street').trim().notEmpty().withMessage('Street address is required'),
    body('address.city').trim().notEmpty().withMessage('City is required'),
    body('address.state').optional().trim(),
    body('address.postCode').optional().trim(),
    body('address.country').trim().notEmpty().withMessage('Country is required'),
];

export const getClientByIdValidation = [
    param('id').notEmpty().withMessage('Client ID is required').isMongoId().withMessage('Invalid client ID'),
];

export const sendClientEmailValidation = [
    ...getClientByIdValidation,
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
];

export const actingAsClientIdValidation = [
    param('clientId').notEmpty().withMessage('Client ID is required').isMongoId().withMessage('Invalid client ID'),
];

export const getClientByClientIdValidation = [
    param('clientId')
        .notEmpty()
        .withMessage('Client ID is required')
        .isInt({ min: 1 })
        .withMessage('Client ID must be a positive integer'),
];

export const getAllClientsValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),

    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

    query('search').optional().trim(),
    query('supportPin').optional().trim(),
];

// Grant access: path params for routes like /:clientId/access-grants/:grantId (reuse clientId param validation)
const GRANT_SCOPES = ['all', 'service_type', 'specific_services'];
const GRANT_PERMISSIONS = ['view', 'manage'];
const GRANT_SERVICE_TYPES = ['HOSTING', 'VPS', 'DOMAIN', 'EMAIL', 'LICENSE'];

export const accessGrantPathValidation = [
    ...actingAsClientIdValidation,
    param('grantId').notEmpty().withMessage('Grant ID is required').isMongoId().withMessage('Invalid grant ID'),
];

export const updateGrantValidation = [
    ...accessGrantPathValidation,
    body('scope').optional().isIn(GRANT_SCOPES).withMessage(`scope must be one of: ${GRANT_SCOPES.join(', ')}`),
    body('serviceType').optional().isIn(GRANT_SERVICE_TYPES).withMessage(`serviceType must be one of: ${GRANT_SERVICE_TYPES.join(', ')}`),
    body('serviceIds').optional().isArray().withMessage('serviceIds must be an array'),
    body('serviceIds.*').optional().isMongoId().withMessage('Each serviceId must be a valid Mongo ID'),
    body('permissions').optional().isArray().withMessage('permissions must be an array'),
    body('permissions.*').optional().isIn(GRANT_PERMISSIONS).withMessage(`Each permission must be one of: ${GRANT_PERMISSIONS.join(', ')}`),
    body('expiresAt')
        .optional({ values: 'null' })
        .custom((v) => v === null || v === undefined || v === '' || !isNaN(Date.parse(v)))
        .withMessage('expiresAt must be a valid date or null'),
    body('allowInvoices').optional().isBoolean().withMessage('allowInvoices must be a boolean'),
    body('allowTickets').optional().isBoolean().withMessage('allowTickets must be a boolean'),
    body('allowOrders').optional().isBoolean().withMessage('allowOrders must be a boolean'),
];

export const revokeGrantValidation = accessGrantPathValidation;


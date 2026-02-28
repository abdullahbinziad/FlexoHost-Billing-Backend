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

export const getClientByIdValidation = [
    param('id').notEmpty().withMessage('Client ID is required').isMongoId().withMessage('Invalid client ID'),
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

    query('companyName').optional().trim(),

    query('firstName').optional().trim(),

    query('lastName').optional().trim(),
];


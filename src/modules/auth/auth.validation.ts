import { body, param } from 'express-validator';

export const registerValidation = [
    body('firstName')
        .trim()
        .notEmpty()
        .withMessage('First Name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('First Name must be between 2 and 50 characters'),

    body('lastName')
        .trim()
        .notEmpty()
        .withMessage('Last Name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Last Name must be between 2 and 50 characters'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage(
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),

    body('phone')
        .optional()
        .isMobilePhone('any')
        .withMessage('Please provide a valid phone number'),

    body('companyName')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name cannot exceed 100 characters'),

    // Prevent privilege escalation / sensitive fields on public registration
    body('role')
        .not()
        .exists()
        .withMessage('Role cannot be set during registration'),
    body('active')
        .not()
        .exists()
        .withMessage('Active cannot be set during registration'),
    body('verified')
        .not()
        .exists()
        .withMessage('Verified cannot be set during registration'),
];

export const loginValidation = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('password').notEmpty().withMessage('Password is required'),
];

export const refreshTokenValidation = [
    body('refreshToken').custom((value, { req }) => {
        const token = value || req.cookies?.refreshToken;
        if (!token) {
            throw new Error('Refresh token is required');
        }
        return true;
    }),
];

export const changePasswordValidation = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),

    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage(
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),

    body('confirmPassword')
        .notEmpty()
        .withMessage('Confirm password is required')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
];

export const forgotPasswordValidation = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
];

export const resetPasswordValidation = [
    body('token').notEmpty().withMessage('Reset token is required'),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage(
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),

    body('confirmPassword')
        .notEmpty()
        .withMessage('Confirm password is required')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
];

export const verifyEmailValidation = [
    param('token').notEmpty().withMessage('Verification token is required'),
];


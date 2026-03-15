import { body, param, query } from 'express-validator';

export const createRoleValidation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Role name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('slug')
        .optional()
        .trim()
        .matches(/^[a-z0-9_]+$/)
        .withMessage('Slug must be lowercase alphanumeric with underscores'),
    body('permissions')
        .optional()
        .isArray()
        .withMessage('Permissions must be an array'),
    body('permissions.*')
        .optional()
        .isString()
        .withMessage('Each permission must be a string'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),
];

export const updateRoleValidation = [
    param('id').isMongoId().withMessage('Invalid role ID'),
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('permissions')
        .optional()
        .isArray()
        .withMessage('Permissions must be an array'),
    body('permissions.*')
        .optional()
        .isString()
        .withMessage('Each permission must be a string'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),
];

export const getRoleByIdValidation = [
    param('id').isMongoId().withMessage('Invalid role ID'),
];

export const importRoleValidation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Role name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('slug')
        .optional()
        .trim()
        .matches(/^[a-z0-9_]+$/)
        .withMessage('Slug must be lowercase alphanumeric with underscores'),
    body('permissions')
        .optional()
        .isArray()
        .withMessage('Permissions must be an array'),
    body('permissions.*')
        .optional()
        .isString()
        .withMessage('Each permission must be a string'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),
];

export const listRolesValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('includeArchived').optional().isBoolean().withMessage('includeArchived must be boolean'),
    query('search').optional().trim(),
];

export const compareRolesValidation = [
    query('id1').isMongoId().withMessage('Invalid role ID 1'),
    query('id2').isMongoId().withMessage('Invalid role ID 2'),
];

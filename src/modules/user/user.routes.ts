import { Router } from 'express';
import userController from './user.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { upload, handleMulterError } from '../../middlewares/upload';
import { virusScanUpload } from '../../middlewares/virusScanUpload';
import {
    updateUserValidation,
    adminUpdateUserValidation,
    getUserByIdValidation,
    getAllUsersValidation,
    bulkAssignRoleValidation,
} from './user.validation';

const router = Router();

// All routes in this file require authentication
router.use(protect);

// Current user routes
router.get('/me', userController.getMe);

router.patch(
    '/me',
    validate(updateUserValidation),
    userController.updateMe
);

router.delete('/me', userController.deleteMe);

// Upload avatar
router.patch(
    '/me/avatar',
    upload.single('avatar'),
    handleMulterError,
    virusScanUpload,
    userController.updateMe
);

// Admin only routes (admin + superadmin)
const adminRoles = ['admin', 'superadmin'];
router.get(
    '/',
    restrictTo(...adminRoles),
    validate(getAllUsersValidation),
    userController.getAllUsers
);

router.patch(
    '/bulk-role',
    restrictTo(...adminRoles),
    validate(bulkAssignRoleValidation),
    userController.bulkAssignRole
);

router.get(
    '/:id',
    restrictTo(...adminRoles),
    validate(getUserByIdValidation),
    userController.getUserById
);

router.patch(
    '/:id',
    restrictTo(...adminRoles),
    validate(adminUpdateUserValidation),
    userController.updateUserById
);

router.delete(
    '/:id',
    restrictTo(...adminRoles),
    validate(getUserByIdValidation),
    userController.deleteUser
);

router.delete(
    '/:id/permanent',
    restrictTo(...adminRoles),
    validate(getUserByIdValidation),
    userController.permanentlyDeleteUser
);

export default router;

import { Router } from 'express';
import userController from './user.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { upload, handleMulterError } from '../../middlewares/upload';
import {
    updateUserValidation,
    adminUpdateUserValidation,
    getUserByIdValidation,
    getAllUsersValidation,
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
    userController.updateMe
);

// Admin only routes
router.get(
    '/',
    restrictTo('admin'),
    validate(getAllUsersValidation),
    userController.getAllUsers
);

router.get(
    '/:id',
    restrictTo('admin'),
    validate(getUserByIdValidation),
    userController.getUserById
);

router.patch(
    '/:id',
    restrictTo('admin'),
    validate(adminUpdateUserValidation),
    userController.updateUserById
);

router.delete(
    '/:id',
    restrictTo('admin'),
    validate(getUserByIdValidation),
    userController.deleteUser
);

router.delete(
    '/:id/permanent',
    restrictTo('admin'),
    validate(getUserByIdValidation),
    userController.permanentlyDeleteUser
);

export default router;

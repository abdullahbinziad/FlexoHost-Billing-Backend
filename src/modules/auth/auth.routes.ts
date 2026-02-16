import { Router } from 'express';
import authController from './auth.controller';
import { protect } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
    registerValidation,
    loginValidation,
    refreshTokenValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    verifyEmailValidation,
    changePasswordValidation,
} from './auth.validation';

const router = Router();

// Public routes
router.post('/register', validate(registerValidation), authController.register);
router.post('/login', validate(loginValidation), authController.login);
router.post('/refresh-token', validate(refreshTokenValidation), authController.refreshToken);
router.post('/forgot-password', validate(forgotPasswordValidation), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordValidation), authController.resetPassword);
router.get('/verify-email/:token', validate(verifyEmailValidation), authController.verifyEmail);

// Protected routes
router.use(protect);

router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.patch('/change-password', validate(changePasswordValidation), authController.changePassword);

export default router;


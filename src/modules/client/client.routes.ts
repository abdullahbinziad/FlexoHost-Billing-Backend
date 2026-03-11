import { Router } from 'express';
import clientController from './client.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
    registerClientValidation,
    updateClientValidation,
    completeProfileValidation,
    getClientByIdValidation,
    getClientByClientIdValidation,
    getAllClientsValidation,
} from './client.validation';

const router = Router();

// Public routes
router.post('/register', validate(registerClientValidation), clientController.registerClient);

// Protected routes – client and user (social signup) roles
router.use(protect);

// Client's own profile – any authenticated user can access their own (client, user, admin, staff, superadmin)
router.get('/me', restrictTo('client', 'user', 'admin', 'staff', 'superadmin'), clientController.getMyProfile);
router.get('/me/support-pin', restrictTo('client', 'user', 'admin', 'staff', 'superadmin'), clientController.getMySupportPin);
router.post('/me/support-pin/regenerate', restrictTo('client', 'user', 'admin', 'staff', 'superadmin'), clientController.regenerateMySupportPin);
router.patch('/me', restrictTo('client', 'user', 'admin', 'staff', 'superadmin'), validate(updateClientValidation), clientController.updateMyProfile);
router.patch('/me/complete-profile', restrictTo('client', 'user', 'admin', 'staff', 'superadmin'), validate(completeProfileValidation), clientController.completeProfile);

// Admin/Staff routes
router.get(
    '/',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(getAllClientsValidation),
    clientController.getAllClients
);

// Admin/staff: regenerate support PIN for a specific client
router.post(
    '/:id/support-pin/regenerate',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(getClientByIdValidation),
    clientController.regenerateSupportPinForClient
);

// Admin/staff: verify support PIN and lookup client
router.post(
    '/verify-support-pin',
    restrictTo('superadmin', 'admin', 'staff'),
    clientController.verifySupportPin
);

router.get(
    '/by-client-id/:clientId',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(getClientByClientIdValidation),
    clientController.getClientByClientId
);

router.get(
    '/:id',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(getClientByIdValidation),
    clientController.getClientById
);

router.patch(
    '/:id',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(getClientByIdValidation),
    validate(updateClientValidation),
    clientController.updateClient
);

router.delete(
    '/:id',
    restrictTo('superadmin', 'admin'),
    validate(getClientByIdValidation),
    clientController.deleteClient
);

router.delete(
    '/:id/permanent',
    restrictTo('superadmin'),
    validate(getClientByIdValidation),
    clientController.permanentlyDeleteClient
);

export default router;

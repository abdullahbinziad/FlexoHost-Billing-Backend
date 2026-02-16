import { Router } from 'express';
import clientController from './client.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
    registerClientValidation,
    updateClientValidation,
    getClientByIdValidation,
    getClientByClientIdValidation,
    getAllClientsValidation,
} from './client.validation';

const router = Router();

// Public routes
router.post('/register', validate(registerClientValidation), clientController.registerClient);

// Protected routes - Client only
router.use(protect);

// Client's own profile
router.get('/me', restrictTo('client'), clientController.getMyProfile);
router.patch('/me', restrictTo('client'), validate(updateClientValidation), clientController.updateMyProfile);

// Admin/Staff routes
router.get(
    '/',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(getAllClientsValidation),
    clientController.getAllClients
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

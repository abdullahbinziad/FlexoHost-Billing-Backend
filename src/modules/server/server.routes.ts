import { Router } from 'express';
import { serverController } from './server.controller';
import { protect, restrictTo } from '../../middlewares/auth';

const router = Router();

// Protect all routes - Admin only
router.use(protect);
router.use(restrictTo('admin', 'superadmin'));

router
    .route('/')
    .get(serverController.getAll)
    .post(serverController.create);

router
    .route('/:id')
    .get(serverController.getOne)
    .patch(serverController.update)
    .delete(serverController.delete);

router.post('/:id/test-connection', serverController.testConnection);
router.get('/:id/packages', serverController.getPackages);
router.post('/:id/sync-accounts', serverController.syncAccounts);

export default router;

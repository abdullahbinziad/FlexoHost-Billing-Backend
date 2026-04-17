import { Router } from 'express';
import { serverController } from './server.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/requirePermission';

const router = Router();

// Protect all routes - Admin only
router.use(protect);
router.use(restrictTo('admin', 'superadmin'));

router
    .route('/')
    .get(requirePermission('servers:list'), serverController.getAll)
    .post(requirePermission('servers:create'), serverController.create);

router
    .route('/:id')
    .get(requirePermission('servers:read'), serverController.getOne)
    .patch(requirePermission('servers:update'), serverController.update)
    .delete(requirePermission('servers:delete'), serverController.delete);

router.post('/:id/test-connection', requirePermission('servers:test_connection'), serverController.testConnection);
router.get('/:id/packages', requirePermission('servers:packages'), serverController.getPackages);
router.post('/:id/sync-accounts', requirePermission('servers:sync_accounts'), serverController.syncAccounts);

router.post('/:id/duplicate', requirePermission('servers:duplicate'), serverController.duplicate);

export default router;

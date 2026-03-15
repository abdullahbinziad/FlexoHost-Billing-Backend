import { Router } from 'express';
import billableItemController from './billable-item.controller';
import { protect, restrictTo } from '../../middlewares/auth';

const router = Router();

router.use(protect);
router.use(restrictTo('superadmin', 'admin', 'staff'));

router.post('/', billableItemController.create);
router.get('/', billableItemController.list);
router.get('/:id', billableItemController.getById);
router.patch('/:id', billableItemController.update);
router.delete('/:id', billableItemController.delete);
router.post('/bulk/invoice-on-cron', billableItemController.bulkInvoiceOnCron);
router.post('/bulk/delete', billableItemController.bulkDelete);

export default router;

import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { getSettings, updateBillingSettingsHandler } from './settings.controller';

const router = Router();

router.use(protect);
router.use(restrictTo('admin', 'superadmin'));

router.get('/', getSettings);
router.patch('/billing', updateBillingSettingsHandler);

export default router;

import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { requireAnyPermission } from '../../middlewares/requirePermission';
import { getSettings, updateBillingSettingsHandler } from './admin-settings.controller';

const router = Router();

router.use(protect);
router.use(restrictTo('admin', 'superadmin', 'staff'));

router.get(
    '/',
    requireAnyPermission(['settings:read', 'settings:update_billing']),
    getSettings
);
router.patch('/billing', updateBillingSettingsHandler);

export default router;

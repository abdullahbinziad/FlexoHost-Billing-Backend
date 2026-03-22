import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/requirePermission';
import { activityLogController } from './activity-log.controller';

const router = Router();
router.use(protect);
router.use(restrictTo('admin', 'staff', 'superadmin'));

router.get('/', requirePermission('dashboard:activity_log'), activityLogController.getActivityLog);

export default router;

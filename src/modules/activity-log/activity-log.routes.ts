import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { activityLogController } from './activity-log.controller';

const router = Router();
router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.get('/', activityLogController.getActivityLog);

export default router;

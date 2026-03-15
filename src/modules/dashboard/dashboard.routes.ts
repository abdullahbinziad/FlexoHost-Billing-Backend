import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { dashboardController } from './dashboard.controller';

const router = Router();
router.use(protect);
router.use(restrictTo('admin', 'staff', 'superadmin'));

router.get('/daily-actions', dashboardController.getDailyActions);
router.get('/daily-actions/details', dashboardController.getDailyActionDetails);

export default router;

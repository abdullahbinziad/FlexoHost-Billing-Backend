import { Router } from 'express';
import notificationController from './notification.controller';
import { protect } from '../../middlewares/auth';

const router = Router();

router.use(protect);

router.get('/', notificationController.getNotifications);
router.patch('/:id/read', notificationController.markAsRead);
router.post('/mark-all-read', notificationController.markAllAsRead);

export default router;


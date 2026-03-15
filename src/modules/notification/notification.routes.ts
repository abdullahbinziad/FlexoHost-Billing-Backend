import { Router } from 'express';
import notificationController from './notification.controller';
import { protect } from '../../middlewares/auth';

const router = Router();

router.use(protect);

router.get('/', notificationController.getNotifications);
router.post('/mark-all-read', notificationController.markAllAsRead);
router.delete('/read/all', notificationController.deleteAllRead);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

export default router;


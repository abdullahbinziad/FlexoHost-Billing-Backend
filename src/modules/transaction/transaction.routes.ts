import { Router } from 'express';
import transactionController from './transaction.controller';
import { protect, restrictTo } from '../../middlewares/auth';

const router = Router();

// Protect all routes
router.use(protect);

// Admin & staff: can see all / filter by clientId
// Client/user: automatically scoped to their own client record
router.get('/', restrictTo('admin', 'staff', 'user', 'client'), transactionController.getTransactions);

export default router;


import { Router } from 'express';
import invoiceController from './invoice.controller';
import { protect, restrictTo } from '../../middlewares/auth';

const router = Router();

// Protect all routes
router.use(protect);

// Routes
router.post('/', restrictTo('admin', 'staff'), invoiceController.createInvoice);
router.get('/', restrictTo('admin', 'staff', 'user', 'client'), invoiceController.getAllInvoices); // Users see their own? Need scope logic in service usually
router.get('/:id', restrictTo('admin', 'staff', 'user', 'client'), invoiceController.getInvoice);
router.patch('/:id/status', restrictTo('admin', 'staff'), invoiceController.updateStatus);

export default router;

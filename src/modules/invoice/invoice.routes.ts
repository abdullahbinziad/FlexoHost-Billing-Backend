import { Router } from 'express';
import invoiceController from './invoice.controller';
import { protect, restrictTo } from '../../middlewares/auth';

const router = Router();

// Protect all routes
router.use(protect);

// Routes
router.post('/', restrictTo('superadmin', 'admin', 'staff'), invoiceController.createInvoice);
router.get('/', restrictTo('superadmin', 'admin', 'staff', 'user', 'client'), invoiceController.getAllInvoices); // Users see their own? Need scope logic in service usually
router.get('/stats', restrictTo('superadmin', 'admin', 'staff'), invoiceController.getDashboardStats);
router.get('/:id/pdf', restrictTo('superadmin', 'admin', 'staff', 'user', 'client'), invoiceController.getInvoicePdf);
router.get('/:id', restrictTo('superadmin', 'admin', 'staff', 'user', 'client'), invoiceController.getInvoice);
router.patch('/:id/status', restrictTo('superadmin', 'admin', 'staff'), invoiceController.updateStatus);
router.patch('/:id', restrictTo('superadmin', 'admin', 'staff'), invoiceController.updateInvoice);
router.delete('/:id', restrictTo('superadmin', 'admin', 'staff'), invoiceController.deleteInvoice);
router.post('/:id/send-reminder', restrictTo('superadmin', 'admin', 'staff'), invoiceController.sendReminder);
router.post('/:id/payments', restrictTo('superadmin', 'admin', 'staff'), invoiceController.addPayment);

export default router;

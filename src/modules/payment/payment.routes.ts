import { Router } from 'express';
import paymentController from './payment.controller';
import { protect, restrictTo } from '../../middlewares/auth'; // Assuming authentication is required for initiating payment

const router = Router();

// Initialize payment by directly passing invoice init data
router.post('/init', protect, paymentController.initPayment);

// Initialize payment directly for an invoice
router.post('/pay-invoice', protect, paymentController.payInvoice);

// Callback routes (public, called by payment gateway)
// These are usually POST for strict security but sometimes GET depending on gateway config.
// SSL Commerz uses POST for IPN and typically POST for success/fail redirection with data
router.post('/success', paymentController.handleSuccess);
router.post('/fail', paymentController.handleFail);
router.post('/cancel', paymentController.handleCancel);
router.post('/ipn', paymentController.handleIpn);

// GET fallbacks if necessary (optional)
router.get('/success', paymentController.handleSuccess);
router.get('/fail', paymentController.handleFail);
router.get('/cancel', paymentController.handleCancel);

// Mock payment success for testing
router.post('/mock-success', protect, restrictTo('admin', 'superadmin'), paymentController.handleMockSuccess);

export default router;

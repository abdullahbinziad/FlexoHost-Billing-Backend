import { Router } from 'express';
import paymentController from './payment.controller';
import { protect } from '../../middlewares/auth'; // Assuming authentication is required for initiating payment

const router = Router();

// Initiate payment (requires authentication probably)
router.post('/init', protect, paymentController.initPayment);

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
router.post('/mock-success', protect, paymentController.handleMockSuccess);

export default router;

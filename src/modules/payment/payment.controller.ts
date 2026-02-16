import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import paymentService from './payment.service';
import { IPaymentInitData } from './payment.interface';

class PaymentController {
    initPayment = catchAsync(async (req: Request, res: Response) => {
        const paymentData: IPaymentInitData = req.body;

        // Ensure URLs are set, maybe override with backend routes if needed logic
        const baseUrl = process.env.API_URL || 'http://localhost:5000/api/v1'; // Adjust as per strict config

        // This is simplified. In production, you might want to enforce these URLs
        if (!paymentData.success_url) paymentData.success_url = `${baseUrl}/payment/success`;
        if (!paymentData.fail_url) paymentData.fail_url = `${baseUrl}/payment/fail`;
        if (!paymentData.cancel_url) paymentData.cancel_url = `${baseUrl}/payment/cancel`;
        if (!paymentData.ipn_url) paymentData.ipn_url = `${baseUrl}/payment/ipn`;

        const result = await paymentService.initPayment(paymentData);
        return ApiResponse.ok(res, 'Payment initialization successful', result);
    });

    handleSuccess = catchAsync(async (req: Request, res: Response) => {
        // This is the callback from SSLCommerz success
        // Usually contains val_id, tran_id, etc.
        const validationData = req.body; // Or req.query depending on method (POST for callback usually)

        const result = await paymentService.validatePayment(validationData);

        // After validation, you might want to update order status in DB
        // For now, return the validation result

        // Redirect to frontend success page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        // You might want to pass some status or token
        res.redirect(`${frontendUrl}/payment/success?tran_id=${result.tran_id}`);
    });

    handleFail = catchAsync(async (req: Request, res: Response) => {
        void req;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/payment/fail`);
    });

    handleCancel = catchAsync(async (req: Request, res: Response) => {
        void req;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/payment/cancel`);
    });

    handleIpn = catchAsync(async (req: Request, res: Response) => {
        // IPN (Instant Payment Notification) usually happens in background
        const ipnData = req.body;
        console.log('IPN received:', ipnData);

        // Validate and update order
        await paymentService.validatePayment(ipnData);

        return res.status(200).send('IPN Received');
    });

    handleMockSuccess = catchAsync(async (req: Request, res: Response) => {
        const { orderId } = req.body;
        if (!orderId) {
            return ApiResponse.error(res, 400, 'Order ID is required');
        }

        const result = await paymentService.processMockPayment(orderId);
        return ApiResponse.success(res, 200, 'Mock payment processed', result);
    });
}

export default new PaymentController();

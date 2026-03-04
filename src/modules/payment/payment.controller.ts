import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import paymentService from './payment.service';
import { IPaymentInitData } from './payment.interface';

class PaymentController {
    initPayment = catchAsync(async (req: Request, res: Response) => {
        const paymentData: IPaymentInitData = req.body;

        const baseUrl = process.env.API_URL || 'http://localhost:3001/api/v1';

        if (!paymentData.success_url) paymentData.success_url = `${baseUrl}/payment/success`;
        if (!paymentData.fail_url) paymentData.fail_url = `${baseUrl}/payment/fail`;
        if (!paymentData.cancel_url) paymentData.cancel_url = `${baseUrl}/payment/cancel`;
        if (!paymentData.ipn_url) paymentData.ipn_url = `${baseUrl}/payment/ipn`;

        const result = await paymentService.initPayment(paymentData);
        return ApiResponse.ok(res, 'Payment initialization successful', result);
    });

    payInvoice = catchAsync(async (req: Request, res: Response) => {
        const { invoiceId, gateway } = req.body;
        if (!invoiceId) {
            return ApiResponse.error(res, 400, 'Invoice ID is required');
        }

        const result = await paymentService.payInvoice(invoiceId, gateway);

        if (result?.status === "FAILED") {
            return ApiResponse.error(res, 400, result.failedreason || 'Payment initialization failed', result);
        }

        return ApiResponse.ok(res, 'Payment initialization successful', result);
    });

    handleSuccess = catchAsync(async (req: Request, res: Response) => {
        const validationData = req.body;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        try {
            const result = await paymentService.handlePaymentSuccess(validationData);
            res.redirect(`${frontendUrl}/invoices/${result.invoiceId}?payment=success&tran_id=${result.tran_id}`);
        } catch (error) {
            console.error('Payment Error:', error);
            res.redirect(`${frontendUrl}/payment/fail`);
        }
    });

    handleFail = catchAsync(async (req: Request, res: Response) => {
        const validationData = req.body || {};
        const invoiceId = validationData.value_a || req.query.value_a;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        if (invoiceId) {
            res.redirect(`${frontendUrl}/invoices/${invoiceId}?payment=failed`);
        } else {
            res.redirect(`${frontendUrl}/invoices`);
        }
    });

    handleCancel = catchAsync(async (req: Request, res: Response) => {
        const validationData = req.body || {};
        const invoiceId = validationData.value_a || req.query.value_a;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        if (invoiceId) {
            res.redirect(`${frontendUrl}/invoices/${invoiceId}?payment=cancelled`);
        } else {
            res.redirect(`${frontendUrl}/invoices`);
        }
    });

    handleIpn = catchAsync(async (req: Request, res: Response) => {
        const ipnData = req.body;
        console.log('IPN received:', ipnData);

        try {
            await paymentService.handlePaymentSuccess(ipnData);
            return res.status(200).send('IPN Received & Processed');
        } catch (error) {
            console.error('IPN Processing Error:', error);
            return res.status(500).send('IPN Processing Error');
        }
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

import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import paymentService from './payment.service';
import { IPaymentInitData } from './payment.interface';
import { getEffectiveClientId } from '../client-access-grant/effective-client';
import { AuthRequest } from '../../middlewares/auth';
import config from '../../config';

class PaymentController {
    initPayment = catchAsync(async (req: Request, res: Response) => {
        const paymentData: IPaymentInitData = req.body;

        const baseUrl = config.api.fullBaseUrl;

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

        const user = (req as AuthRequest).user!;
        const isAdmin = ['admin', 'superadmin', 'staff'].includes(user.role);
        let requesterClientId: string | undefined;
        if (!isAdmin) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'invoices');
            if (effectiveClientId === null) return;
            requesterClientId = effectiveClientId;
        }

        const result = await paymentService.payInvoice(invoiceId, gateway, requesterClientId);

        if (result?.status === "FAILED") {
            return ApiResponse.error(res, 400, result.failedreason || 'Payment initialization failed', result);
        }

        return ApiResponse.ok(res, 'Payment initialization successful', result);
    });

    handleSuccess = catchAsync(async (req: Request, res: Response) => {
        const validationData = req.body || {};
        const frontendUrl = config.frontendUrl;

        try {
            const result = await paymentService.handlePaymentSuccess(validationData);
            res.redirect(`${frontendUrl}/invoices/${result.invoiceId}?payment=success&tran_id=${result.tran_id}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Payment validation or processing failed';
            const { default: logger } = await import('../../utils/logger');
            logger.warn('[Payment] Success callback failed:', msg);
            const invoiceId = validationData.value_a || req.query?.value_a;
            const { auditLogSafe } = await import('../activity-log/activity-log.service');
            auditLogSafe({
                message: `Payment success callback failed for invoice ${invoiceId || 'unknown'}`,
                type: 'payment_failed',
                category: 'payment',
                actorType: 'system',
                source: 'webhook',
                status: 'failure',
                severity: 'medium',
                invoiceId: invoiceId ? String(invoiceId) : undefined,
                meta: { reason: msg } as Record<string, unknown>,
            });
            res.redirect(`${frontendUrl}/payment/fail`);
        }
    });

    handleFail = catchAsync(async (req: Request, res: Response) => {
        const validationData = req.body || req.query || {};
        const invoiceId = validationData.value_a || req.query.value_a;
        const frontendUrl = config.frontendUrl;

        const { auditLogSafe } = await import('../activity-log/activity-log.service');
        const Invoice = (await import('../invoice/invoice.model')).default;
        const emailService = (await import('../email/email.service')).default;
        let clientId: string | undefined;
        if (invoiceId) {
            try {
                const inv = await Invoice.findById(invoiceId)
                    .populate({ path: 'clientId', select: 'contactEmail firstName lastName', populate: { path: 'user', select: 'email' } })
                    .lean();
                if (inv) {
                    clientId = (inv.clientId as any)?.toString?.();
                    const client = inv.clientId as any;
                    const clientEmail = client?.contactEmail || client?.user?.email;
                    if (clientEmail) {
                        const customerName = client?.firstName || client?.lastName
                            ? `${client?.firstName || ''} ${client?.lastName || ''}`.trim()
                            : 'Customer';
                        const baseUrl = frontendUrl.replace(/\/$/, '');
                        emailService.sendTemplatedEmail({
                            to: clientEmail,
                            templateKey: 'billing.payment_failed',
                            props: {
                                customerName,
                                invoiceNumber: (inv as any).invoiceNumber || 'N/A',
                                amountDue: String((inv as any).balanceDue ?? (inv as any).total ?? 0),
                                currency: (inv as any).currency || 'BDT',
                                dueDate: (inv as any).dueDate ? new Date((inv as any).dueDate).toLocaleDateString() : 'N/A',
                                retryPaymentUrl: `${baseUrl}/invoices/${invoiceId}/pay`,
                                billingUrl: `${baseUrl}/client`,
                            },
                        }).catch(() => {});
                    }
                }
            } catch {
                // ignore
            }
        }
        auditLogSafe({
            message: `Client payment failed (redirected to fail URL) for invoice ${invoiceId || 'unknown'}`,
            type: 'payment_failed',
            category: 'payment',
            actorType: 'system',
            source: 'webhook',
            status: 'failure',
            severity: 'medium',
            clientId,
            invoiceId: invoiceId ? String(invoiceId) : undefined,
            meta: { reason: 'redirected_to_fail_url' } as Record<string, unknown>,
        });

        if (invoiceId) {
            res.redirect(`${frontendUrl}/invoices/${invoiceId}?payment=failed`);
        } else {
            res.redirect(`${frontendUrl}/invoices`);
        }
    });

    handleCancel = catchAsync(async (req: Request, res: Response) => {
        const validationData = req.body || req.query || {};
        const invoiceId = validationData.value_a || req.query.value_a;
        const frontendUrl = config.frontendUrl;

        const { auditLogSafe } = await import('../activity-log/activity-log.service');
        const Invoice = (await import('../invoice/invoice.model')).default;
        let clientId: string | undefined;
        if (invoiceId) {
            try {
                const inv = await Invoice.findById(invoiceId).select('clientId invoiceNumber').lean();
                if (inv) clientId = (inv.clientId as any)?.toString?.();
            } catch {
                // ignore
            }
        }
        auditLogSafe({
            message: `Client payment cancelled for invoice ${invoiceId || 'unknown'}`,
            type: 'payment_failed',
            category: 'payment',
            actorType: 'system',
            source: 'webhook',
            status: 'failure',
            severity: 'low',
            clientId,
            invoiceId: invoiceId ? String(invoiceId) : undefined,
            meta: { reason: 'cancelled_by_user' } as Record<string, unknown>,
        });

        if (invoiceId) {
            res.redirect(`${frontendUrl}/invoices/${invoiceId}?payment=cancelled`);
        } else {
            res.redirect(`${frontendUrl}/invoices`);
        }
    });

    handleIpn = catchAsync(async (req: Request, res: Response) => {
        const ipnData = req.body || {};
        const { default: logger } = await import('../../utils/logger');
        logger.info('[Payment] IPN received', { invoiceId: ipnData.value_a ?? ipnData.invoiceId });

        try {
            await paymentService.handlePaymentSuccess(ipnData);
            return res.status(200).send('IPN Received & Processed');
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'IPN processing failed';
            logger.warn('[Payment] IPN processing failed:', msg);
            const invoiceId = ipnData.value_a || ipnData.invoiceId;
            const { auditLogSafe } = await import('../activity-log/activity-log.service');
            auditLogSafe({
                message: `IPN payment processing failed for invoice ${invoiceId || 'unknown'}`,
                type: 'payment_failed',
                category: 'payment',
                actorType: 'system',
                source: 'webhook',
                status: 'failure',
                severity: 'medium',
                invoiceId: invoiceId ? String(invoiceId) : undefined,
                meta: { reason: msg } as Record<string, unknown>,
            });
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

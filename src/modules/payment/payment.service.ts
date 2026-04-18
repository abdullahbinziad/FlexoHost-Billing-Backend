import { IPaymentGateway, IPaymentInitData, PaymentValidationStatus } from './payment.interface';
import SslCommerzPayment from './gateways/sslcommerz';
import ApiError from '../../utils/apiError';
import Order from '../order/order.model';
import Invoice from '../invoice/invoice.model';
import invoiceService from '../invoice/invoice.service';
import { OrderStatus } from '../order/order.interface';
import { InvoiceStatus } from '../invoice/invoice.interface';
import mongoose from 'mongoose';
import { handleInvoicePaid } from '../services/core';
import serviceLifecycleService from '../services/core/service-lifecycle.service';
import Client from '../client/client.model';
import User from '../user/user.model';
import PaymentTransaction from '../transaction/transaction.model';
import { TransactionStatus, TransactionType } from '../transaction/transaction.interface';
import { buildPaymentFxSnapshot } from '../exchange-rate/fx.service';
import notificationService from '../notification/notification.service';
import * as emailService from '../email/email.service';
import { getInvoicePdfBuffer } from '../invoice/pdf/invoice-pdf.service';
import config from '../../config';
import logger from '../../utils/logger';
import { affiliateService } from '../affiliate/affiliate.service';
import { assertPaymentMatchesInvoice } from './payment-validation.util';

class PaymentService {
    private gateways: Map<string, IPaymentGateway> = new Map();
    private defaultGateway: string = 'sslcommerz';

    constructor() {
        const { storeId, storePassword, isLive } = config.payment.sslcommerz;

        if (config.env === 'production' && (!storeId || !storePassword)) {
            throw new Error('SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD are required in production');
        }

        const sslCommerz = new SslCommerzPayment(storeId, storePassword, isLive);
        this.gateways.set(sslCommerz.name, sslCommerz);
    }

    private getGateway(name?: string): IPaymentGateway {
        const gatewayName = name || this.defaultGateway;
        const gateway = this.gateways.get(gatewayName);

        if (!gateway) {
            throw new ApiError(400, `Payment gateway ${gatewayName} not configured`);
        }
        return gateway;
    }

    async initPayment(data: IPaymentInitData, gatewayName?: string): Promise<any> {
        const gateway = this.getGateway(gatewayName);
        return gateway.init(data);
    }

    async validatePayment(data: any, gatewayName?: string): Promise<any> {
        const gateway = this.getGateway(gatewayName);
        return gateway.validate(data);
    }

    async payInvoice(invoiceId: string, gatewayName?: string, requesterClientId?: string): Promise<any> {
        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) throw new ApiError(404, 'Invoice not found');
        if (invoice.status === InvoiceStatus.PAID) throw new ApiError(400, 'Invoice already paid');

        if (requesterClientId && invoice.clientId?.toString() !== requesterClientId) {
            throw new ApiError(403, 'You do not have permission to pay this invoice');
        }

        const client = await Client.findById(invoice.clientId);
        if (!client) throw new ApiError(404, 'Client not found');

        const user = await User.findById(client.user);

        const baseUrl = config.api.fullBaseUrl;

        // `tran_id` is required by SSL. We will use it to link back to the invoice.
        // Format: INV-{invoiceId}-{timestamp}
        const tran_id = `TRX_${invoice._id}_${Date.now()}`;

        const productDesc = invoice.items.length ? invoice.items.map(i => i.description).join(', ') : 'Web Hosting Services';

        const paymentData: IPaymentInitData = {
            total_amount: invoice.balanceDue,
            currency: invoice.currency,
            tran_id: tran_id,
            success_url: `${baseUrl}/payment/success`,
            fail_url: `${baseUrl}/payment/fail`,
            cancel_url: `${baseUrl}/payment/cancel`,
            ipn_url: `${baseUrl}/payment/ipn`,
            cus_name: invoice.billedTo.customerName || 'N/A',
            cus_email: user?.email || 'test@test.com',
            cus_add1: invoice.billedTo.address || 'N/A',
            cus_city: 'Dhaka', // Defaulting as needed, since we only have full address string
            cus_country: invoice.billedTo.country || 'Bangladesh',
            cus_phone: client.phoneNumber || '01711111111',
            shipping_method: 'NO',
            product_name: productDesc.length > 255 ? productDesc.substring(0, 250) + '...' : productDesc,
            product_category: 'Hosting',
            product_profile: 'general',
            value_a: invoice._id.toString(), // Store invoiceId in value_a to easily retrieve it in callback
        };

        const gateway = this.getGateway(gatewayName);
        return gateway.init(paymentData);
    }

    async handlePaymentSuccess(validationData: any, gatewayName?: string): Promise<any> {
        // Validation data from SSL usually includes `val_id` on the success callback
        const gateway = this.getGateway(gatewayName);
        const result = await gateway.validate(validationData);

        if (result.status === PaymentValidationStatus.VALID || result.status === PaymentValidationStatus.VALIDATED) {
            const invoiceId = result.value_a;
            if (!invoiceId) throw new ApiError(400, 'Invoice ID not found in transaction data');

            const invoice = await Invoice.findById(invoiceId);
            if (!invoice) throw new ApiError(404, 'Invoice not found');

            const gatewayId = gatewayName || this.defaultGateway;
            const transactionId = typeof result.tran_id === 'string' ? result.tran_id.trim() : '';
            if (!transactionId) {
                throw new ApiError(400, 'Gateway transaction ID is missing');
            }

            const existingTransaction = await PaymentTransaction.findOne({
                gateway: gatewayId,
                externalTransactionId: transactionId,
                status: TransactionStatus.SUCCESS,
            })
                .select('_id')
                .lean()
                .exec();

            if (existingTransaction) {
                return { message: 'Already processed', invoiceId: invoice._id, tran_id: transactionId };
            }

            const { amount, currency } = assertPaymentMatchesInvoice({
                invoiceBalanceDue: invoice.balanceDue,
                invoiceCurrency: invoice.currency,
                paidAmount: result.amount,
                paidCurrency: typeof result.currency === 'string' ? result.currency : result.currency_type,
            });

            if (invoice.status === InvoiceStatus.PAID) {
                return { message: 'Already paid', invoiceId: invoice._id, tran_id: transactionId };
            }

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                // 1. Update Invoice
                invoice.status = InvoiceStatus.PAID;
                invoice.credit = invoice.total;
                invoice.balanceDue = 0;
                invoice.paymentMethod = gatewayId;
                await invoice.save({ session });

                // 2. Determine if it has an Order to fulfill
                let orderUserId: mongoose.Types.ObjectId | undefined;
                if (invoice.orderId) {
                    const order = await Order.findById(invoice.orderId).session(session);
                    if (order) {
                        order.status = OrderStatus.PROCESSING; // Triggers provisioning if applicable
                        order.paidAt = new Date();
                        order.meta = order.meta || {};
                        order.meta.paymentMethod = gatewayId;
                        order.meta.transactionId = transactionId;
                        orderUserId = order.userId as any;
                        await order.save({ session });
                    }
                }

                // 3. Record payment transaction (with FX snapshot at payment date)
                const paymentDate = new Date();
                const { snapshot: paymentFx, isLegacy: paymentFxLegacy } = await buildPaymentFxSnapshot(
                    amount,
                    currency,
                    paymentDate
                );

                await PaymentTransaction.create(
                    [
                        {
                            invoiceId: invoice._id,
                            orderId: invoice.orderId,
                            clientId: invoice.clientId as any,
                            userId: orderUserId,
                            gateway: gatewayId,
                            type: TransactionType.CHARGE,
                            status: TransactionStatus.SUCCESS,
                            amount,
                            currency,
                            paymentDate,
                            fxSnapshot: paymentFx,
                            fxSnapshotLegacy: paymentFxLegacy,
                            externalTransactionId: transactionId,
                            gatewayPayload: result,
                        },
                    ],
                    { session }
                );

                await session.commitTransaction();

                // Provisioning jobs run outside the payment txn; only queue after commit so unpaid invoices never get jobs if commit fails.
                await handleInvoicePaid(invoice._id as any);

                // Sync invoice FX snapshot (balanceDueInBase = 0)
                const updatedInvoice = await Invoice.findById(invoice._id);
                if (updatedInvoice) await invoiceService.setInvoiceFxSnapshot(updatedInvoice);
                await affiliateService.processPaidInvoice(invoice._id.toString());

                // Unsuspend outside session because it might call HTTP hooks
                await serviceLifecycleService.onInvoicePaidUnsuspend(invoice._id as any);
                await serviceLifecycleService.applyRenewalPayment(invoice._id as any);

                const clientDoc = await Client.findById(invoice.clientId).select('user contactEmail firstName lastName').lean();
                const notificationUserId = clientDoc?.user || orderUserId || invoice.clientId;
                await notificationService.create({
                    userId: notificationUserId as any,
                    clientId: invoice.clientId as any,
                    category: 'billing',
                    title: `Payment received for Invoice ${invoice.invoiceNumber}`,
                    message: `We received your payment of ${amount} ${currency} via ${gatewayId}.`,
                    linkPath: `/invoices/${invoice._id.toString()}`,
                    linkLabel: 'View invoice',
                    meta: {
                        invoiceId: invoice._id.toString(),
                        tran_id: transactionId,
                    },
                });
                const clientEmail = clientDoc?.contactEmail || '';
                const customerName = clientDoc ? `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim() || 'Customer' : 'Customer';
                const baseUrl = config.frontendUrl;
                if (clientEmail) {
                    let attachments: { filename: string; content: Buffer }[] | undefined;
                    try {
                        const paidInvoice = await Invoice.findById(invoice._id).lean();
                        if (paidInvoice) {
                            const pdfBuffer = await getInvoicePdfBuffer(paidInvoice as any);
                            attachments = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }];
                        }
                    } catch (pdfErr: any) {
                        logger.warn('[Payment] Invoice PDF for email failed:', pdfErr?.message);
                    }
                    emailService.sendTemplatedEmail({
                        to: clientEmail,
                        templateKey: 'billing.payment_success',
                        props: {
                            customerName,
                            invoiceNumber: invoice.invoiceNumber,
                            transactionId: transactionId || 'N/A',
                            amountPaid: String(amount),
                            currency: currency || invoice.currency || 'BDT',
                            paymentDate: new Date().toLocaleDateString(),
                            paymentMethodLabel: gatewayId === 'sslcommerz' ? 'Card / Mobile Banking' : gatewayId,
                            billingUrl: `${baseUrl}/client`,
                        },
                        attachments,
                    }).catch(() => {});
                }

                const { auditLogSafe } = await import('../activity-log/activity-log.service');
                auditLogSafe({
                    message: `Payment received for Invoice ${invoice.invoiceNumber} via ${gatewayId}: ${amount} ${currency}`,
                    type: 'payment_received',
                    category: 'payment',
                    actorType: 'system',
                    source: 'webhook',
                    clientId: (invoice.clientId as any)?.toString(),
                    invoiceId: invoice._id.toString(),
                    status: 'success',
                    meta: { gateway: gatewayId, transactionId: transactionId ? '[REDACTED]' : undefined },
                });

                return { message: 'Payment successful', invoiceId: invoice._id, tran_id: transactionId };
            } catch (error: any) {
                await session.abortTransaction();
                if (error?.code === 11000) {
                    return { message: 'Already processed', invoiceId: invoice._id, tran_id: transactionId };
                }
                throw error;
            } finally {
                session.endSession();
            }
        } else {
            const invoiceId = result?.value_a || validationData?.value_a;
            const { auditLogSafe } = await import('../activity-log/activity-log.service');
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
                message: `Payment failed or invalid for invoice ${invoiceId || 'unknown'}`,
                type: 'payment_failed',
                category: 'payment',
                actorType: 'system',
                source: 'webhook',
                status: 'failure',
                severity: 'medium',
                clientId,
                invoiceId: invoiceId ? String(invoiceId) : undefined,
                meta: { gateway: gatewayName || this.defaultGateway, validationStatus: result?.status } as Record<string, unknown>,
            });
            throw new ApiError(400, 'Payment validation failed');
        }
    }

    /**
     * Process a mock payment for testing/development
     * Updates Order -> Invoice -> Service
     */
    async processMockPayment(orderId: string): Promise<any> {
        if (config.env === 'production') {
            throw new ApiError(403, 'Mock payments are disabled in production');
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const order = await Order.findById(orderId).session(session);
            if (!order) {
                throw new ApiError(404, 'Order not found');
            }

            if (order.status === OrderStatus.PROCESSING || order.status === OrderStatus.ACTIVE) {
                await session.abortTransaction();
                return { message: 'Order already completed', order };
            }

            // 1. Update Order
            order.status = OrderStatus.PROCESSING;
            order.meta = order.meta || {};
            order.meta.paymentMethod = 'MOCK_PAYMENT';
            order.meta.transactionId = `MOCK_TRX_${Date.now()}`;
            order.paidAt = new Date();
            await order.save({ session });

            // 2. Update Invoice
            const invoice = await Invoice.findById(order.invoiceId).session(session);
            if (invoice) {
                invoice.status = InvoiceStatus.PAID;
                invoice.credit = invoice.total;
                invoice.balanceDue = 0;
                invoice.paymentMethod = 'MOCK_PAYMENT';
                await invoice.save({ session });

                // Record mock payment transaction (with FX snapshot at payment date)
                const paymentDate = new Date();
                const { snapshot: mockFx, isLegacy: mockFxLegacy } = await buildPaymentFxSnapshot(
                    invoice.total,
                    invoice.currency,
                    paymentDate
                );
                await PaymentTransaction.create(
                    [
                        {
                            invoiceId: invoice._id,
                            orderId: order._id,
                            clientId: invoice.clientId as any,
                            userId: order.userId as any,
                            gateway: 'mock',
                            type: TransactionType.CHARGE,
                            status: TransactionStatus.SUCCESS,
                            amount: invoice.total,
                            currency: invoice.currency,
                            paymentDate,
                            fxSnapshot: mockFx,
                            fxSnapshotLegacy: mockFxLegacy,
                            externalTransactionId: order.meta.transactionId,
                            gatewayPayload: null,
                        },
                    ],
                    { session }
                );
            }

            await session.commitTransaction();

            const updatedInvoice = await Invoice.findById(order.invoiceId);
            if (updatedInvoice) await invoiceService.setInvoiceFxSnapshot(updatedInvoice);
            if (order.invoiceId) {
                const invId = order.invoiceId as any;
                await affiliateService.processPaidInvoice(invId.toString());
                await handleInvoicePaid(invId);
                await serviceLifecycleService.onInvoicePaidUnsuspend(invId);
                await serviceLifecycleService.applyRenewalPayment(invId);
            }

            return { message: 'Payment processed successfully', orderId };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
}

export default new PaymentService();

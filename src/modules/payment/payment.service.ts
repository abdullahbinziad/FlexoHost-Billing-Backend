import { IPaymentGateway, IPaymentInitData } from './payment.interface';
import SslCommerzPayment from './gateways/sslcommerz';
import ApiError from '../../utils/apiError';
import Order from '../order/order.model';
import Invoice from '../invoice/invoice.model';
import { OrderStatus } from '../order/order.interface';
import { InvoiceStatus } from '../invoice/invoice.interface';
import mongoose from 'mongoose';
import { handleInvoicePaid } from '../services/services';
import serviceLifecycleService from '../services/services/service-lifecycle.service';
import Client from '../client/client.model';
import User from '../user/user.model';

class PaymentService {
    private gateways: Map<string, IPaymentGateway> = new Map();
    private defaultGateway: string = 'sslcommerz';

    constructor() {
        // Initialize gateways with credentials from env
        const sslStoreId = process.env.SSLCOMMERZ_STORE_ID || 'testbox';
        const sslStorePassword = process.env.SSLCOMMERZ_STORE_PASSWORD || 'qwerty';
        const sslIsLive = process.env.SSLCOMMERZ_IS_LIVE === 'true';

        const sslCommerz = new SslCommerzPayment(sslStoreId, sslStorePassword, sslIsLive);
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

    async payInvoice(invoiceId: string, gatewayName?: string): Promise<any> {
        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) throw new ApiError(404, 'Invoice not found');
        if (invoice.status === InvoiceStatus.PAID) throw new ApiError(400, 'Invoice already paid');

        const client = await Client.findById(invoice.clientId);
        if (!client) throw new ApiError(404, 'Client not found');

        const user = await User.findById(client.user);

        const baseUrl = process.env.API_URL || 'http://localhost:3000/api/v1';

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

        if (result.status === 'VALID' || result.status === 'VALIDATED') {
            const invoiceId = result.value_a;
            if (!invoiceId) throw new ApiError(400, 'Invoice ID not found in transaction data');

            const invoice = await Invoice.findById(invoiceId);
            if (!invoice) throw new ApiError(404, 'Invoice not found');

            if (invoice.status === InvoiceStatus.PAID) {
                return { message: 'Already paid', invoiceId: invoice._id };
            }

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                // 1. Update Invoice
                invoice.status = InvoiceStatus.PAID;
                invoice.balanceDue = 0;
                invoice.paymentMethod = gatewayName || this.defaultGateway;
                // Optionally add a transaction record to invoice.transactions here
                await invoice.save({ session });

                // 2. Determine if it has an Order to fulfill
                if (invoice.orderId) {
                    const order = await Order.findById(invoice.orderId).session(session);
                    if (order) {
                        order.status = OrderStatus.PROCESSING; // Triggers provisioning if applicable
                        order.paidAt = new Date();
                        order.meta = order.meta || {};
                        order.meta.paymentMethod = gatewayName || this.defaultGateway;
                        order.meta.transactionId = result.tran_id;
                        await order.save({ session });
                    }
                }

                // 3. Process services
                await handleInvoicePaid(invoice._id as any);

                await session.commitTransaction();

                // Unsuspend outside session because it might call HTTP hooks
                await serviceLifecycleService.onInvoicePaidUnsuspend(invoice._id as any);
                await serviceLifecycleService.applyRenewalPayment(invoice._id as any);

                return { message: 'Payment successful', invoiceId: invoice._id, tran_id: result.tran_id };
            } catch (error) {
                await session.abortTransaction();
                throw error;
            } finally {
                session.endSession();
            }
        } else {
            throw new ApiError(400, 'Payment validation failed');
        }
    }

    /**
     * Process a mock payment for testing/development
     * Updates Order -> Invoice -> Service
     */
    async processMockPayment(orderId: string): Promise<any> {
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
                invoice.balanceDue = 0;
                invoice.paymentMethod = 'MOCK_PAYMENT';
                await invoice.save({ session });
            }

            // 3. Create Services & Evaluate Suspensions
            if (invoice) {
                await handleInvoicePaid(invoice._id as any);
                await serviceLifecycleService.onInvoicePaidUnsuspend(invoice._id as any);
                await serviceLifecycleService.applyRenewalPayment(invoice._id as any);
            }

            await session.commitTransaction();
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

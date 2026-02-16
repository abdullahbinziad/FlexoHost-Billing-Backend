import { IPaymentGateway, IPaymentInitData } from './payment.interface';
import SslCommerzPayment from './gateways/sslcommerz';
import ApiError from '../../utils/apiError';
import Order from '../order/order.model';
import Invoice from '../invoice/invoice.model';
import { OrderStatus } from '../order/order.interface';
import { InvoiceStatus } from '../invoice/invoice.interface';
import { serviceService } from '../service/service.service';
import mongoose from 'mongoose';

class PaymentService {
    private gateways: Map<string, IPaymentGateway> = new Map();
    private defaultGateway: string = 'SslCommerz';

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

            if (order.status === OrderStatus.COMPLETED) {
                await session.abortTransaction();
                return { message: 'Order already completed', order };
            }

            // 1. Update Order
            order.status = OrderStatus.COMPLETED;
            order.paymentMethod = 'MOCK_PAYMENT';
            order.transactionId = `MOCK_TRX_${Date.now()}`;
            await order.save({ session });

            // 2. Update Invoice
            const invoice = await Invoice.findById(order.invoiceId).session(session);
            if (invoice) {
                invoice.status = InvoiceStatus.PAID;
                invoice.balanceDue = 0;
                await invoice.save({ session });
            }

            // 3. Create Services
            for (const item of order.items) {
                await serviceService.createServiceFromOrder(order, item, session);
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

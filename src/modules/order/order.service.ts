import Order from './order.model';
import Invoice from '../invoice/invoice.model';
import { IOrder, IOrderItem, OrderStatus } from './order.interface';
import { InvoiceStatus, InvoiceItemType } from '../invoice/invoice.interface';
import mongoose from 'mongoose';

export class OrderService {
    /**
     * Create a new order
     * 1. Validate items
     * 2. Calculate totals
     * 3. Create Invoice
     * 4. Create Order
     */
    async createOrder(userId: string, items: IOrderItem[], paymentMethod: string, currency: string = 'USD'): Promise<IOrder> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Calculate totals
            let totalAmount = 0;
            const invoiceItems = items.map(item => {
                totalAmount += item.price;
                return {
                    type: InvoiceItemType.HOSTING, // Generalizing for now, could be dynamic based on item.type
                    description: item.description,
                    amount: item.price,
                };
            });

            // 2. Create Invoice
            // Generate a simple invoice number (You might want a better system for this)
            const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days

            const invoice = new Invoice({
                invoiceNumber,
                status: InvoiceStatus.UNPAID,
                dueDate,
                billedTo: {
                    customerName: 'Customer', // TODO: Fetch user details to populate this
                    address: 'N/A',
                    country: 'N/A'
                },
                items: invoiceItems,
                currency,
                subTotal: totalAmount,
                total: totalAmount,
                balanceDue: totalAmount,
            });

            await invoice.save({ session });

            // 3. Create Order
            const order = new Order({
                userId,
                invoiceId: invoice._id,
                status: OrderStatus.PENDING,
                totalAmount,
                currency,
                paymentMethod,
                items,
            });

            await order.save({ session });

            await session.commitTransaction();
            return order;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async getOrders(userId: string): Promise<IOrder[]> {
        return Order.find({ userId }).sort({ createdAt: -1 });
    }

    async getOrder(orderId: string): Promise<IOrder | null> {
        return Order.findById(orderId).populate('invoiceId');
    }
}

export const orderService = new OrderService();

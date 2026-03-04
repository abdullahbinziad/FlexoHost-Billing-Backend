import mongoose from 'mongoose';
import Order from './order.model';
import OrderItem from './order-item.model';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import Product from '../product/product.model';
import Client from '../client/client.model';
import invoiceService from '../invoice/invoice.service';
import { OrderStatus } from './order.interface';
import { DomainActionType } from './order-item.interface';
import { TLDModel } from '../domain/tld/tld.model';
import { ServiceType } from '../services/types/enums';

class OrderService {
    // -------------------------
    // YOUR EXISTING METHODS
    // -------------------------
    async createOrder(payload: any, currentUserId?: string) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Identify Client and User
            let clientId: mongoose.Types.ObjectId;
            let userId: mongoose.Types.ObjectId;

            if (payload.client?.type === 'existing') {
                // The frontend currently sends user.id as payload.client.clientId
                userId = new mongoose.Types.ObjectId(payload.client.clientId);
                const clientDoc = await Client.findOne({ user: userId }).session(session);
                if (!clientDoc) throw new Error('Client not found');
                clientId = clientDoc._id as mongoose.Types.ObjectId;
            } else if (payload.client?.type === 'new' || currentUserId) {
                // In a real flow, if 'new', registration happens before or during this.
                // Assuming userId is provided or resolved from existing client session
                userId = new mongoose.Types.ObjectId(currentUserId);
                const clientDoc = await Client.findOne({ user: userId }).session(session);
                if (!clientDoc) throw new Error('Client record missing for user');
                clientId = clientDoc._id as mongoose.Types.ObjectId;
            } else {
                throw new Error('User identity required to create order');
            }

            // 2. Resolve Product and Pricing (Hosting)
            const product = await Product.findById(payload.productId).session(session);
            if (!product) throw new Error('Product not found');

            const currency = payload.currency || 'BDT';
            const billingCycle = payload.billingCycle || 'monthly';

            const currencyPricing = product.pricing?.find(p => p.currency === currency);
            if (!currencyPricing && product.paymentType !== 'free') {
                throw new Error(`Pricing not available for currency: ${currency}`);
            }

            const cyclePricing = currencyPricing ? (currencyPricing as any)[billingCycle] : null;
            if (cyclePricing && !cyclePricing.enable) {
                throw new Error(`Billing cycle ${billingCycle} not enabled for this product`);
            }

            const hostingSubtotal = cyclePricing?.price || 0;
            const hostingSetupFee = cyclePricing?.setupFee || 0;
            const hostingTotal = hostingSubtotal + hostingSetupFee;

            let total = hostingTotal;
            let subtotal = hostingSubtotal;

            // Prepare Order Items
            const orderItemsPayloads: any[] = [];
            const invoiceItemsPayloads: any[] = [];

            // Add Hosting Item
            const hostingConfigSnapshot: any = {
                serverLocation: payload.serverLocation,
                domain: payload.domain?.ownDomain?.domainName ||
                    payload.domain?.registration?.domainName ||
                    payload.domain?.transfer?.domainName
            };

            orderItemsPayloads.push({
                clientId,
                type: product.type.toUpperCase() as any, // e.g., HOSTING
                productId: product._id,
                nameSnapshot: product.name,
                billingCycle: billingCycle as any,
                qty: 1,
                pricingSnapshot: {
                    setup: hostingSetupFee,
                    recurring: hostingSubtotal,
                    discount: 0,
                    tax: 0,
                    total: hostingTotal,
                    currency
                },
                configSnapshot: hostingConfigSnapshot
            });

            invoiceItemsPayloads.push({
                type: product.type.toUpperCase() as any,
                description: `${product.name} - ${billingCycle}`,
                amount: hostingTotal,
                meta: { type: 'HOSTING' }
            });

            // 3. Resolve Domain Pricing (if applicable)
            if (payload.domain?.action === 'register' || payload.domain?.action === 'transfer') {
                const isRegister = payload.domain.action === 'register';
                const domainData = isRegister ? payload.domain.registration : payload.domain.transfer;

                if (!domainData || !domainData.tld || !domainData.domainName) {
                    throw new Error('Incomplete domain data provided');
                }

                const tld = domainData.tld.startsWith('.') ? domainData.tld : `.${domainData.tld}`;
                const period = String(domainData.period || 1) as "1" | "2" | "3";

                const tldDoc = await TLDModel.findOne({ tld }).session(session);
                if (!tldDoc) throw new Error(`TLD ${tld} not supported`);

                const currPricing = tldDoc.pricing.find(p => p.currency === currency);
                const periodPricing = currPricing ? (currPricing as any)[period] : null;

                if (!periodPricing || !periodPricing.enable) {
                    throw new Error(`Pricing not available for ${period} year(s) in currency ${currency} for TLD ${tld}`);
                }

                const domainPrice = isRegister ? periodPricing.register : periodPricing.transfer;

                total += domainPrice;
                subtotal += domainPrice;

                // Determine matching enum for domain period
                const domainBillingCycle = period === "1" ? "annually" : period === "2" ? "biennially" : "triennially";

                orderItemsPayloads.push({
                    clientId,
                    type: ServiceType.DOMAIN,
                    actionType: isRegister ? DomainActionType.REGISTER : DomainActionType.TRANSFER,
                    nameSnapshot: `${domainData.domainName}`,
                    billingCycle: domainBillingCycle,
                    qty: 1,
                    pricingSnapshot: {
                        setup: 0,
                        recurring: domainPrice,
                        discount: 0,
                        tax: 0,
                        total: domainPrice,
                        currency
                    },
                    configSnapshot: {
                        domainName: domainData.domainName,
                        tld: tld,
                        period: parseInt(period),
                        eppCode: isRegister ? undefined : domainData.eppCode
                    }
                });

                invoiceItemsPayloads.push({
                    type: ServiceType.DOMAIN,
                    description: `Domain ${isRegister ? 'Registration' : 'Transfer'} - ${domainData.domainName}${tld} (${period} Year)`,
                    amount: domainPrice,
                    meta: { type: 'DOMAIN' }
                });
            }

            // 4. Generate IDs
            const orderSeq = await getNextSequence('order');
            const orderId = formatSequenceId('ORD', orderSeq);
            const orderNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();

            // 5. Create Order
            const [order] = await Order.create([{
                orderId,
                orderNumber,
                clientId,
                userId,
                status: OrderStatus.PENDING_PAYMENT,
                currency,
                subtotal,
                discountTotal: 0, // apply logic here if promo exists
                taxTotal: 0,
                total,
                meta: {
                    billingCycle,
                    serverLocation: payload.serverLocation,
                    coupon: payload.coupon,
                    referral: payload.referral
                }
            }], { session, ordered: true });

            // 6. Create Order Items
            await OrderItem.create(orderItemsPayloads.map(item => ({ ...item, orderId: order._id })), { session, ordered: true });

            // 7. Create Invoice
            const clientDoc = await Client.findById(clientId).session(session);
            invoiceItemsPayloads.forEach(item => item.meta.orderId = order._id); // tag logic

            const invoice = await invoiceService.createInvoice({
                clientId,
                orderId: order._id as any,
                currency,
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                billedTo: {
                    customerName: `${clientDoc?.firstName || 'Customer'} ${clientDoc?.lastName || ''}`.trim(),
                    address: clientDoc?.address?.street || 'Address',
                    country: clientDoc?.address?.country || 'Country'
                },
                items: invoiceItemsPayloads,
                paymentMethod: payload.paymentMethod
            });

            // Update order with invoiceId
            order.invoiceId = invoice._id as any;
            await order.save({ session });

            await session.commitTransaction();

            return {
                id: order._id,
                orderId: order.orderId,
                orderNumber: order.orderNumber,
                invoiceId: invoice._id
            };

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async finalizeOrderIfProvisioned(orderId: string) {
        const order = await Order.findById(orderId);
        if (!order) return;

        if (order.status !== OrderStatus.ACTIVE) {
            order.status = OrderStatus.ACTIVE;
            await order.save();
        }
    }

    async getOrders(filter: any) {
        const orders: any[] = await Order.find(filter)
            .populate('clientId', 'firstName lastName contactEmail')
            .populate('invoiceId', 'paymentMethod total status')
            .sort({ createdAt: -1 })
            .lean();

        return orders.map((order) => ({
            _id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            client: {
                name: order.clientId ? `${order.clientId.firstName} ${order.clientId.lastName}`.trim() : 'N/A',
                email: order.clientId?.contactEmail || 'N/A',
            },
            date: order.createdAt,
            invoice: {
                paymentMethod: order.invoiceId?.paymentMethod || 'N/A',
                total: order.invoiceId?.total || 0,
            },
            paymentStatus: order.invoiceId?.status || 'N/A',
            currency: order.currency || 'N/A',
            status: order.status,
        }));
    }

    // -------------------------
    // ✅ NEW METHODS
    // -------------------------

    private ensureObjectId(id: string, label = 'ID') {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            const err = new Error(`Invalid ${label}`);
            (err as any).statusCode = 400;
            throw err;
        }
        return new mongoose.Types.ObjectId(id);
    }

    // minimal order fetch for ownership checks
    async getOrderBasic(orderId: string) {
        const _id = this.ensureObjectId(orderId, 'Order ID');
        return Order.findById(_id).select('_id userId clientId').lean();
    }

    // ✅ order items only
    async getOrderItemsByOrderId(orderId: string) {
        const _id = this.ensureObjectId(orderId, 'Order ID');
        return OrderItem.find({ orderId: _id }).sort({ createdAt: 1 }).lean();
    }

    // ✅ fetch full order details
    async getOrder(orderId: string) {
        return this.getOrderWithItems(orderId);
    }

    // ✅ order + items (single query using $lookup)
    async getOrderWithItems(orderId: string) {
        const _id = this.ensureObjectId(orderId, 'Order ID');

        const result = await Order.aggregate([
            { $match: { _id } },

            // join order items
            {
                $lookup: {
                    from: 'orderitems', // collection name (mongoose pluralizes)
                    localField: '_id',
                    foreignField: 'orderId',
                    as: 'items',
                },
            },

            // optional: sort items inside result
            {
                $addFields: {
                    items: {
                        $sortArray: { input: '$items', sortBy: { createdAt: 1 } },
                    },
                },
            },

            // optional: populate user/client basic data (if needed)
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: 'clients',
                    localField: 'clientId',
                    foreignField: '_id',
                    as: 'client',
                },
            },
            { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: 'invoices',
                    localField: 'invoiceId',
                    foreignField: '_id',
                    as: 'invoice',
                },
            },
            { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },

            // Include all necessary data for details view while keeping it structured
            {
                $project: {
                    _id: 1,
                    orderId: 1,
                    orderNumber: 1,
                    status: 1,
                    currency: 1,
                    subtotal: 1,
                    discountTotal: 1,
                    taxTotal: 1,
                    total: 1,
                    date: '$createdAt',
                    userId: 1,
                    meta: 1,
                    client: {
                        _id: '$client._id',
                        name: { $concat: ['$client.firstName', ' ', '$client.lastName'] },
                        email: '$client.contactEmail',
                        companyName: '$client.companyName',
                        address: '$client.address',
                    },
                    invoice: {
                        _id: '$invoice._id',
                        invoiceNumber: '$invoice.invoiceNumber',
                        paymentMethod: '$invoice.paymentMethod',
                        total: '$invoice.total',
                        status: '$invoice.status',
                        dueDate: '$invoice.dueDate',
                    },
                    paymentStatus: '$invoice.status',
                    items: 1,
                },
            },
        ]);

        return result[0] || null;
    }
}

export const orderService = new OrderService();
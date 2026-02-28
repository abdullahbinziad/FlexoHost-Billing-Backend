import Order from './order.model';
import Invoice from '../invoice/invoice.model';
import { IOrder, OrderStatus } from './order.interface';
import { InvoiceStatus, InvoiceItemType } from '../invoice/invoice.interface';
import mongoose from 'mongoose';
import Client from '../client/client.model';

export class OrderService {
    /**
     * Create a new order
     * 1. Validate items
     * 2. Calculate totals
     * 3. Create Invoice
     * 4. Create Order
     */
    /**
     * Create a new order with complex payload
     * 1. Validate / Create User
     * 2. Validate Product & Pricing
     * 3. Create Services (PENDING)
     * 4. Create Invoice (UNPAID)
     * 5. Create Order (PENDING)
     */
    async createOrder(payload: any, currentUserId?: string): Promise<IOrder> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // --- 1. Client Identity Handling ---
            let userId = currentUserId;

            if (payload.client.type === 'new') {
                const { account } = payload.client;
                // Check if email exists
                const existingUser = await mongoose.model('User').findOne({ email: account.email }).session(session);
                if (existingUser) {
                    throw new Error('Email already registered. Please login.');
                }

                // Hash password (the User model pre-save hook might do this, but we'll let the model handle it)
                const newUser = new (mongoose.model('User'))({
                    name: `${account.firstName} ${account.lastName}`,
                    email: account.email,
                    password: account.password,
                    phone: account.phone,
                    company: account.company,
                    address: account.address,
                });

                await newUser.save({ session });
                userId = newUser._id.toString();
            } else if (payload.client.type === 'existing') {
                if (!userId || userId !== payload.client.clientId) {
                    throw new Error('Unauthorized or client mismatch');
                }
            } else {
                throw new Error('Invalid client type');
            }

            if (!userId) {
                throw new Error('User identification failed');
            }

            const user = await mongoose.model('User').findById(userId).session(session);
            if (!user) throw new Error('User not found');

            // --- 2. Product & Pricing Validation ---
            const Product = mongoose.model('Product');
            const product = await Product.findById(payload.productId).session(session);
            if (!product) throw new Error('Product not found');

            const currency = payload.currency || 'USD';
            let hostingPrice = 0;

            if (product.paymentType !== 'free') {
                const currencyPricing: any = product.pricing?.find((p: any) => p.currency === currency);
                if (!currencyPricing) throw new Error(`Currency ${currency} not supported for this product`);

                const cyclePricing = currencyPricing[payload.billingCycle];
                if (!cyclePricing || !cyclePricing.enable) {
                    throw new Error(`Billing cycle ${payload.billingCycle} is not enabled for this product`);
                }
                hostingPrice = cyclePricing.price + cyclePricing.setupFee;
            }

            // --- Domain Pricing Validation ---
            let domainPrice = 0;
            let domainDetails: any = null;

            if (payload.domain && payload.domain.action !== 'use-owned') {
                const TLDModel = mongoose.model('TLD');

                if (payload.domain.action === 'register' && payload.domain.registration) {
                    const { domainName, tld, period } = payload.domain.registration;
                    const cleanTld = tld.startsWith('.') ? tld.substring(1) : tld;
                    const searchTld = `.${cleanTld}`;
                    const tldData: any = await TLDModel.findOne({ tld: searchTld }).session(session);

                    if (!tldData) throw new Error(`TLD ${tld} not supported`);

                    const tldPricing = tldData.pricing?.find((p: any) => p.currency === currency);
                    if (!tldPricing) throw new Error(`Currency ${currency} not supported for TLD ${tld}`);

                    const periodStr = String(period || 1);
                    const tldPeriodPricing = tldPricing[periodStr];

                    if (!tldPeriodPricing || !tldPeriodPricing.enable) {
                        throw new Error(`Registration period ${periodStr} years is not enabled for TLD ${tld}`);
                    }

                    domainPrice = tldPeriodPricing.register || 0;
                    domainDetails = {
                        domainName: `${domainName}.${cleanTld}`,
                        registrationYears: period,
                    };
                } else if (payload.domain.action === 'transfer' && payload.domain.transfer) {
                    const { domainName, tld, eppCode } = payload.domain.transfer;
                    const cleanTld = tld.startsWith('.') ? tld.substring(1) : tld;
                    const searchTld = `.${cleanTld}`;
                    const tldData: any = await TLDModel.findOne({ tld: searchTld }).session(session);

                    if (!tldData) throw new Error(`TLD ${tld} not supported`);

                    const tldPricing = tldData.pricing?.find((p: any) => p.currency === currency);
                    if (!tldPricing) throw new Error(`Currency ${currency} not supported for TLD ${tld}`);

                    const periodStr = "1"; // Assuming transfer is 1 year
                    const tldPeriodPricing = tldPricing[periodStr];

                    if (!tldPeriodPricing || !tldPeriodPricing.enable) {
                        throw new Error(`Transfer is not enabled for TLD ${tld}`);
                    }

                    domainPrice = tldPeriodPricing.transfer || 0;
                    domainDetails = {
                        domainName: `${domainName}.${cleanTld}`,
                        authCode: eppCode,
                    };
                }
            } else if (payload.domain.action === 'use-owned' && payload.domain.ownDomain) {
                const { domainName, tld } = payload.domain.ownDomain;
                const cleanTld = tld.startsWith('.') ? tld.substring(1) : tld;
                domainDetails = {
                    domainName: `${domainName}.${cleanTld}`,
                };
            }

            // --- 3. Create Services (PENDING) ---
            const Service = mongoose.model('Service');

            // Note: We need the Order ID to link to the services.
            // But we also need the Services created. We'll generate an ObjectId for the Order first.
            const orderId = new mongoose.Types.ObjectId();

            const services = [];

            // Hosting Service
            const hostingService = new Service({
                userId,
                orderId,
                type: 'HOSTING',
                productId: product._id,
                productName: product.name,
                status: 'PENDING',
                billingCycle: payload.billingCycle,
                recurringAmount: hostingPrice,
                currency,
                serverLocation: payload.serverLocation,
                startDate: new Date(),
                nextDueDate: new Date(), // Will be updated when paid
                domainDetails: domainDetails ? {
                    domainName: domainDetails.domainName,
                } : undefined
            });
            await hostingService.save({ session });
            services.push(hostingService);

            // Domain Service
            if (domainDetails && payload.domain.action !== 'use-owned') {
                const domainService = new Service({
                    userId,
                    orderId,
                    type: 'DOMAIN',
                    productId: 'domain', // Or a reference to the TLD
                    productName: `Domain ${payload.domain.action}: ${domainDetails.domainName}`,
                    status: 'PENDING',
                    billingCycle: 'annually', // Domains are usually annual
                    recurringAmount: domainPrice,
                    currency,
                    startDate: new Date(),
                    nextDueDate: new Date(),
                    domainDetails,
                });
                await domainService.save({ session });
                services.push(domainService);
            }

            // --- 4. Create Invoice (UNPAID) ---
            const invoiceItems = [];
            invoiceItems.push({
                type: InvoiceItemType.HOSTING,
                description: `${product.name} - ${payload.billingCycle}`,
                amount: hostingPrice,
            });

            if (domainPrice > 0) {
                invoiceItems.push({
                    type: InvoiceItemType.DOMAIN,
                    description: `Domain ${payload.domain.action} - ${domainDetails.domainName}`,
                    amount: domainPrice,
                });
            }

            const totalAmount = hostingPrice + domainPrice;

            // Get user details for invoice
            let userClientDetails: any = null;
            if (userId) {
                userClientDetails = await Client.findOne({ user: userId }).session(session);
            }

            const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);

            const invoice = new Invoice({
                invoiceNumber,
                status: InvoiceStatus.UNPAID,
                dueDate,
                billedTo: {
                    customerName: userClientDetails ? `${userClientDetails.firstName} ${userClientDetails.lastName}` : 'N/A',
                    address: userClientDetails?.address?.street || 'N/A',
                    country: userClientDetails?.address?.country || 'N/A'
                },
                items: invoiceItems,
                currency,
                subTotal: totalAmount,
                total: totalAmount,
                balanceDue: totalAmount,
                orderId: orderId, // Link the invoice back to the order
            });

            await invoice.save({ session });

            // --- 5. Create Order (PENDING) ---
            const orderItems = invoiceItems.map(item => ({
                productId: item.type === InvoiceItemType.HOSTING ? product._id.toString() : 'domain',
                type: item.type,
                description: item.description,
                price: item.amount,
                billingCycle: payload.billingCycle,
                domainDetails: item.type === InvoiceItemType.DOMAIN ? domainDetails : undefined,
            }));

            const order = new Order({
                _id: orderId, // Use the pre-generated ID
                userId,
                invoiceId: invoice._id,
                status: OrderStatus.PENDING,
                totalAmount,
                currency,
                paymentMethod: payload.paymentMethod,
                items: orderItems,
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

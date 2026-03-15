import crypto from 'crypto';
import mongoose from 'mongoose';
import config from '../../config';
import { DEFAULT_CURRENCY } from '../../config/currency.config';
import Order from './order.model';
import OrderItem from './order-item.model';
import Service from '../services/service.model';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import Product from '../product/product.model';
import Client from '../client/client.model';
import Server from '../server/server.model';
import { serverService } from '../server/server.service';
import invoiceService from '../invoice/invoice.service';
import Invoice from '../invoice/invoice.model';
import { getInvoicePdfBuffer } from '../invoice/invoice-pdf.service';
import notificationService from '../notification/notification.service';
import * as emailService from '../email/email.service';
import { promotionService } from '../promotion/promotion.service';
import { OrderStatus } from './order.interface';
import { DomainActionType } from './order-item.interface';
import { TLDModel } from '../domain/tld/tld.model';
import { ServiceType, normalizeBillingCycle } from '../services/types/enums';
import { ControlPanelType } from '../services/models/hosting-details.model';
import logger from '../../utils/logger';
import { escapeRegex } from '../../utils/string.util';
import { affiliateService } from '../affiliate/affiliate.service';
import { AffiliateReferralSource } from '../affiliate/affiliate.types';
import { getBillingSettings } from '../settings/billing-settings.service';
import { SUPPORTED_CURRENCIES } from '../../config/currency.config';

/** Default payment methods for admin order creation (extend via settings if needed) */
const DEFAULT_PAYMENT_METHODS = [
    { id: 'manual', name: 'Manual / Bank Transfer' },
    { id: 'invoice', name: 'Invoice' },
    { id: 'stripe', name: 'Stripe' },
    { id: 'paypal', name: 'PayPal' },
    { id: 'sslcommerz', name: 'SSLCommerz' },
    { id: 'bkash', name: 'bKash' },
    { id: 'nagad', name: 'Nagad' },
];

/** Result of creating one hosting account (for runModuleCreate and provisioning provider). */
export interface CreateHostingAccountResult {
    serverId: string;
    accountUsername: string;
    primaryDomain: string;
    whmPackageName: string;
    /** Shape for HostingServiceDetails persistence */
    details: Record<string, unknown>;
    /** True when WHM createAccount was called this run; false when returning existing meta only */
    actuallyCreated?: boolean;
    /** Transient password for welcome email only; never persisted to DB */
    password?: string;
}

/** Generate a strong random password for new cPanel/WHM accounts (alphanumeric + safe symbols). */
function generateHostingAccountPassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += charset[bytes[i] % charset.length];
    }
    return result;
}

function normalizeCodeSafe(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

class OrderService {
    /** Get order config for admin new order: server locations, payment methods, currencies */
    async getOrderConfig(): Promise<{
        serverLocations: Array<{ id: string; name: string }>;
        paymentMethods: Array<{ id: string; name: string }>;
        supportedCurrencies: string[];
    }> {
        const locations = await Server.distinct('location').lean();
        const serverLocations = (locations || []).length > 0
            ? locations.map((loc: string) => ({ id: loc, name: loc }))
            : [
                { id: 'Auto', name: 'Auto' },
                { id: 'USA', name: 'USA' },
                { id: 'Malaysia', name: 'Malaysia' },
                { id: 'Singapore', name: 'Singapore' },
                { id: 'Bangladesh', name: 'Bangladesh' },
                { id: 'Germany', name: 'Germany' },
                { id: 'Finland', name: 'Finland' },
            ];
        return {
            serverLocations,
            paymentMethods: DEFAULT_PAYMENT_METHODS,
            supportedCurrencies: [...SUPPORTED_CURRENCIES],
        };
    }

    // -------------------------
    // YOUR EXISTING METHODS
    // -------------------------
    async createOrder(payload: any, currentUserId?: string, isAdminContext?: boolean) {
        if (!currentUserId) {
            throw new Error('Authentication required to create order');
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Identify Client and User
            let clientId: mongoose.Types.ObjectId;
            let userId: mongoose.Types.ObjectId;

            if (payload.client?.type === 'admin_selected' && isAdminContext) {
                // Admin creating order for any client. clientId is Client document _id.
                const requestedClientId = payload.client?.clientId;
                if (!requestedClientId) throw new Error('Client is required for admin order creation');
                const clientDoc = await Client.findById(requestedClientId).session(session);
                if (!clientDoc) throw new Error('Client not found');
                clientId = clientDoc._id as mongoose.Types.ObjectId;
                userId = clientDoc.user as mongoose.Types.ObjectId;
            } else if (payload.client?.type === 'existing') {
                // The frontend sends user.id as payload.client.clientId. Must match authenticated user.
                const requestedUserId = payload.client?.clientId;
                if (!requestedUserId || String(requestedUserId) !== String(currentUserId)) {
                    throw new Error('Client identity must match authenticated user');
                }
                userId = new mongoose.Types.ObjectId(requestedUserId);
                const clientDoc = await Client.findOne({ user: userId }).session(session);
                if (!clientDoc) throw new Error('Client not found');
                clientId = clientDoc._id as mongoose.Types.ObjectId;
            } else {
                // type === 'new' or default: use authenticated user
                userId = new mongoose.Types.ObjectId(currentUserId);
                const clientDoc = await Client.findOne({ user: userId }).session(session);
                if (!clientDoc) throw new Error('Client record missing for user');
                clientId = clientDoc._id as mongoose.Types.ObjectId;
            }

            const currency = payload.currency || DEFAULT_CURRENCY;
            const billingCycle = payload.billingCycle
                ? normalizeBillingCycle(payload.billingCycle)
                : undefined;
            const requiresProduct = Boolean(payload.productId);
            const isStandaloneDomainOrder = !requiresProduct && (
                payload.domain?.action === 'register' || payload.domain?.action === 'transfer'
            );

            if (!requiresProduct && !isStandaloneDomainOrder) {
                throw new Error('Product not found. Please try again.');
            }

            let product: any = null;
            let total = 0;
            let subtotal = 0;

            // Prepare Order Items
            const orderItemsPayloads: any[] = [];
            const invoiceItemsPayloads: any[] = [];

            if (requiresProduct) {
                // 2. Resolve Product and Pricing (Hosting / Product-backed checkout)
                product = await Product.findById(payload.productId).session(session);
                if (!product) throw new Error('Product not found');
                if (!billingCycle) throw new Error('Billing cycle is required');

                const currencyPricing = product.pricing?.find((p: any) => p.currency === currency);
                if (!currencyPricing && product.paymentType !== 'free') {
                    throw new Error(`Pricing not available for currency: ${currency}`);
                }

                const cyclePricing = currencyPricing ? (currencyPricing as any)[billingCycle] : null;
                if (cyclePricing && !cyclePricing.enable) {
                    throw new Error(`Billing cycle ${billingCycle} not enabled for this product`);
                }

                let hostingSubtotal = cyclePricing?.price || 0;
                let hostingSetupFee = cyclePricing?.setupFee || 0;
                const productPriceOverride = payload.productPriceOverride != null
                    ? parseFloat(String(payload.productPriceOverride))
                    : NaN;
                if (isAdminContext && !Number.isNaN(productPriceOverride) && productPriceOverride >= 0) {
                    hostingSubtotal = productPriceOverride;
                    hostingSetupFee = 0;
                }
                const qty = Math.max(1, parseInt(String(payload.qty || 1), 10) || 1);
                const hostingTotalSingle = hostingSubtotal + hostingSetupFee;
                const hostingTotal = hostingTotalSingle * qty;

                total = hostingTotal;
                subtotal = hostingSubtotal * qty;

                // Add Hosting Item: store chosen domain as primaryDomain (for cPanel / provisioning).
                // Source: Use Owned Domain, Register, or Transfer at checkout.
                const primaryDomainRaw = payload.domain?.ownDomain?.domainName ||
                    payload.domain?.registration?.domainName ||
                    payload.domain?.transfer?.domainName;
                const primaryDomain = typeof primaryDomainRaw === 'string' && primaryDomainRaw.trim()
                    ? primaryDomainRaw.trim()
                    : '';
                const hostingConfigSnapshot: any = {
                    serverLocation: payload.serverLocation,
                    serverGroup: product.module?.serverGroup,
                    primaryDomain,
                };

                orderItemsPayloads.push({
                    clientId,
                    type: product.type.toUpperCase() as any, // e.g., HOSTING
                    productId: product._id,
                    nameSnapshot: product.name,
                    billingCycle: billingCycle as any,
                    qty,
                    pricingSnapshot: {
                        setup: hostingSetupFee * qty,
                        recurring: hostingSubtotal * qty,
                        discount: 0,
                        tax: 0,
                        total: hostingTotal,
                        currency
                    },
                    configSnapshot: hostingConfigSnapshot
                });

                invoiceItemsPayloads.push({
                    type: product.type.toUpperCase() as any,
                    description: qty > 1 ? `${product.name} - ${billingCycle} (×${qty})` : `${product.name} - ${billingCycle}`,
                    amount: hostingTotal,
                    meta: { type: 'HOSTING' }
                });
            }

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

                let domainPrice = isRegister ? periodPricing.register : periodPricing.transfer;
                const domainPriceOverride = domainData.priceOverride != null
                    ? parseFloat(String(domainData.priceOverride))
                    : NaN;
                if (isAdminContext && !Number.isNaN(domainPriceOverride) && domainPriceOverride >= 0) {
                    domainPrice = domainPriceOverride;
                }

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
                        years: parseInt(period),
                        eppCode: isRegister ? undefined : domainData.eppCode
                    }
                });

                invoiceItemsPayloads.push({
                    type: ServiceType.DOMAIN,
                    description: `Domain ${isRegister ? 'Registration' : 'Transfer'} - ${domainData.domainName} (${period} Year)`,
                    amount: domainPrice,
                    meta: { type: 'DOMAIN' }
                });
            }

            // 3b. Apply coupon if provided
            let discountTotal = 0;
            let appliedPromotionId: string | null = null;
            let appliedAffiliateReferralCode: string | null = null;

            const couponCode = typeof payload.coupon === 'string' ? payload.coupon : payload.coupon?.code;
            if (couponCode) {
                const isFirstOrder = (await Order.countDocuments({ clientId }).session(session)) === 0;
                const productIds = product?._id ? [product._id.toString()] : [];
                const productTypes = product?.type ? [product.type] : [];
                const productBillingCycle = product && billingCycle ? billingCycle : undefined;

                const domainTlds: string[] = [];
                let domainBillingCycle: string | undefined;
                if (payload.domain?.action === 'register' || payload.domain?.action === 'transfer') {
                    const domainData = payload.domain.action === 'register'
                        ? payload.domain.registration
                        : payload.domain.transfer;
                    if (domainData?.tld) {
                        domainTlds.push(domainData.tld.startsWith('.') ? domainData.tld : `.${domainData.tld}`);
                    }
                    const period = String(domainData?.period || 1);
                    domainBillingCycle = period === '1' ? 'annually' : period === '2' ? 'biennially' : 'triennially';
                }

                const couponResult = await promotionService.validateCoupon({
                    code: couponCode,
                    subtotal: total,
                    currency,
                    clientId: clientId.toString(),
                    productIds,
                    productTypes,
                    productBillingCycle,
                    domainTlds,
                    domainBillingCycle,
                    isFirstOrder,
                });

                if (!couponResult.valid) {
                    throw new Error(couponResult.error || 'Invalid coupon code');
                }
                discountTotal = couponResult.discountAmount ?? 0;
                appliedPromotionId = couponResult.promotion?._id?.toString() ?? null;
                appliedAffiliateReferralCode = couponResult.source === 'affiliate'
                    ? (couponResult.code || couponCode).toUpperCase()
                    : null;
            }

            total = Math.max(0, total - discountTotal);

            // 4. Generate IDs
            const orderSeq = await getNextSequence('order');
            const orderId = formatSequenceId('ORD', orderSeq);
            const orderNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();

            // Admin may override initial status (only when admin context)
            const validStatuses = Object.values(OrderStatus);
            const requestedStatus = payload.status && isAdminContext && validStatuses.includes(payload.status)
                ? payload.status
                : OrderStatus.PENDING_PAYMENT;

            // 5. Create Order
            const [order] = await Order.create([{
                orderId,
                orderNumber,
                clientId,
                userId,
                status: requestedStatus,
                currency,
                subtotal,
                discountTotal,
                taxTotal: 0,
                total,
                meta: {
                    billingCycle,
                    serverLocation: payload.serverLocation,
                    coupon: payload.coupon,
                    referral: payload.referral,
                    promotionId: appliedPromotionId,
                    affiliateReferralCode: appliedAffiliateReferralCode,
                }
            }], { session, ordered: true });

            // 6. Create Order Items
            await OrderItem.create(orderItemsPayloads.map(item => ({ ...item, orderId: order._id })), { session, ordered: true });

            const skipInvoice = isAdminContext && payload.generateInvoice === false;
            let invoice: any = null;

            if (!skipInvoice) {
                // 7. Create Invoice
                const clientDoc = await Client.findById(clientId).session(session);
                invoiceItemsPayloads.forEach(item => item.meta.orderId = order._id); // tag logic

                const billingSettings = await getBillingSettings();
                const invoiceDueDays = billingSettings.invoiceDueDays ?? 7;

                invoice = await invoiceService.createInvoice(
                    {
                        clientId,
                        orderId: order._id as any,
                        currency,
                        dueDate: new Date(Date.now() + invoiceDueDays * 24 * 60 * 60 * 1000),
                        billedTo: {
                            customerName: `${clientDoc?.firstName || 'Customer'} ${clientDoc?.lastName || ''}`.trim(),
                            address: clientDoc?.address?.street || 'Address',
                            country: clientDoc?.address?.country || 'Country'
                        },
                        items: invoiceItemsPayloads,
                        discount: discountTotal,
                        paymentMethod: payload.paymentMethod
                    },
                    {
                        session,
                        sendEmail: false,
                    }
                );

                // Notify user about new invoice
                await notificationService.create({
                    userId,
                    clientId,
                    category: 'billing',
                    title: `New invoice ${invoice.invoiceNumber} created`,
                    message: `An invoice has been created for your order #${order.orderId}.`,
                    linkPath: `/invoices/${invoice._id.toString()}`,
                    linkLabel: 'View invoice',
                    meta: {
                        invoiceId: invoice._id.toString(),
                        orderId: order._id.toString(),
                    },
                });

                // Update order with invoiceId
                order.invoiceId = invoice._id as any;
                await order.save({ session });
            }

            // Record promotion usage for analytics (inside transaction) - even when invoice is skipped
            if (appliedPromotionId && discountTotal > 0) {
                await promotionService.recordUsage(
                    appliedPromotionId,
                    clientId.toString(),
                    order._id.toString(),
                    discountTotal,
                    session
                );
            }

            await session.commitTransaction();

            const { auditLogSafe } = await import('../activity-log/activity-log.service');
            auditLogSafe({
                message: `Order ${order.orderNumber} created`,
                type: 'order_created',
                category: 'order',
                actorType: currentUserId ? 'user' : 'system',
                actorId: currentUserId,
                targetType: 'order',
                targetId: order._id.toString(),
                source: 'manual',
                clientId: clientId.toString(),
                orderId: order._id.toString(),
                ...(invoice && { invoiceId: invoice._id.toString() }),
            });

            const trackedReferralCode = typeof payload.referral === 'string' && payload.referral.trim()
                ? payload.referral
                : appliedAffiliateReferralCode;
            const referralSource = appliedAffiliateReferralCode && (!payload.referral || normalizeCodeSafe(payload.referral) === appliedAffiliateReferralCode)
                ? AffiliateReferralSource.COUPON
                : AffiliateReferralSource.CODE;
            if (trackedReferralCode && invoice) {
                affiliateService.trackReferralAttribution({
                    buyerClientId: clientId.toString(),
                    orderId: order._id.toString(),
                    invoiceId: invoice._id.toString(),
                    referralCode: trackedReferralCode,
                    source: referralSource,
                }).catch((error: any) => {
                    logger.warn('[Affiliate] Failed to track order referral attribution:', error?.message || error);
                });
            }

            const clientForEmail = await Client.findById(clientId)
                .select('contactEmail firstName lastName')
                .populate('user', 'email')
                .lean();
            const clientEmail = (clientForEmail as any)?.contactEmail || (clientForEmail as any)?.user?.email || '';
            const customerName = clientForEmail
                ? `${(clientForEmail as any).firstName || ''} ${(clientForEmail as any).lastName || ''}`.trim() || 'Customer'
                : 'Customer';
            const baseUrl = config.frontendUrl || config.cors?.origin || 'http://localhost:3000';

            const shouldSendEmail = payload.sendEmail !== false && Boolean(clientEmail);
            if (!clientEmail) {
                logger.warn(`[Order] No email for client ${clientId}; skipping order confirmation and invoice emails for order ${order.orderNumber}`);
            } else if (payload.sendEmail === false) {
                logger.info(`[Order] sendEmail=false; skipping order confirmation and invoice emails for order ${order.orderNumber}`);
            }

            if (shouldSendEmail) {
                try {
                    const orderConfirmResult = await emailService.sendTemplatedEmail({
                        to: clientEmail,
                        templateKey: 'order.confirmation',
                        props: {
                            customerName,
                            orderNumber: order.orderNumber,
                            orderDate: new Date().toLocaleDateString(),
                            items: orderItemsPayloads.map((p: any) => ({
                                name: p.nameSnapshot,
                                type: p.type || 'Service',
                                billingCycle: normalizeBillingCycle(p.billingCycle),
                                quantity: p.qty || 1,
                                price: String(p.pricingSnapshot?.total ?? 0),
                            })),
                            subtotal: String(invoice?.subTotal ?? order.subtotal ?? 0),
                            tax: '0',
                            total: String(invoice?.total ?? order.total ?? 0),
                            currency: currency,
                            paymentStatus: 'Pending Payment',
                            clientAreaUrl: `${baseUrl}/client`,
                            supportUrl: `${baseUrl}/support`,
                        },
                    });
                    if (!orderConfirmResult.success) {
                        logger.warn(`[Order] Order confirmation email failed for ${clientEmail}: ${orderConfirmResult.error}`);
                    }
                } catch (e: any) {
                    logger.warn('[Order] Order confirmation email error:', e?.message || e);
                }
                if (invoice) {
                    try {
                        const lineItems = (invoice.items || []).map((i: any) => ({
                            label: i.description || 'Item',
                            amount: String(i.amount ?? 0),
                        }));
                        if (lineItems.length === 0) lineItems.push({ label: 'Total', amount: String(invoice.total ?? 0) });
                        let attachments: { filename: string; content: Buffer }[] | undefined;
                        try {
                            const pdfBuffer = await getInvoicePdfBuffer(invoice);
                            attachments = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }];
                        } catch (pdfErr: any) {
                            logger.warn('[Order] Invoice PDF generation failed, sending email without attachment:', pdfErr?.message);
                        }
                        const invoiceCreatedResult = await emailService.sendTemplatedEmail({
                            to: clientEmail,
                            templateKey: 'billing.invoice_created',
                            props: {
                                customerName,
                                invoiceNumber: invoice.invoiceNumber,
                                dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A',
                                amountDue: String(invoice.balanceDue ?? invoice.total ?? 0),
                                currency,
                                invoiceUrl: `${baseUrl}/invoices/${invoice._id}`,
                                billingUrl: `${baseUrl}/client`,
                                lineItems,
                            },
                            attachments,
                        });
                        if (!invoiceCreatedResult.success) {
                            logger.warn(`[Order] Invoice created email failed for ${clientEmail}: ${invoiceCreatedResult.error}`);
                        }
                    } catch (e: any) {
                        logger.warn('[Order] Invoice created email error:', e?.message || e);
                    }
                }
            }

            return {
                id: order._id,
                orderId: order.orderId,
                orderNumber: order.orderNumber,
                ...(invoice && { invoiceId: invoice._id }),
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

    async getOrders(filter: any, options: { page?: number; limit?: number } = {}) {
        const query: any = {};
        const page = Math.max(Number(options.page) || 1, 1);
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;

        if (filter.clientId) query.clientId = filter.clientId;
        if (filter.userId) query.userId = filter.userId;

        // Exclude soft-deleted orders
        query.$and = query.$and || [];
        query.$and.push({
            $or: [{ 'meta.deleted': { $ne: true } }, { 'meta.deleted': { $exists: false } }],
        });

        if (filter.status) {
            const normalizedStatus = String(filter.status).trim().toLowerCase();
            if (normalizedStatus === 'active') query.status = OrderStatus.ACTIVE;
            else if (normalizedStatus === 'cancelled') query.status = OrderStatus.CANCELLED;
            else if (normalizedStatus === 'fraud') query.status = OrderStatus.FRAUD;
            else if (normalizedStatus === 'pending') {
                query.status = {
                    $in: [
                        OrderStatus.DRAFT,
                        OrderStatus.PENDING_PAYMENT,
                        OrderStatus.PROCESSING,
                        OrderStatus.ON_HOLD,
                    ],
                };
            }
        }

        if (filter.paymentStatus) {
            const normalizedPaymentStatus = String(filter.paymentStatus).trim().toUpperCase();
            const matchingInvoices = await Invoice.find({ status: normalizedPaymentStatus }).select('_id').lean();
            if (matchingInvoices.length === 0) {
                return { results: [], page, limit, totalPages: 0, totalResults: 0 };
            }
            query.invoiceId = { $in: matchingInvoices.map((invoice: any) => invoice._id) };
        }

        if (filter.search && String(filter.search).trim()) {
            const rawSearch = String(filter.search).trim();
            const escapedSearch = escapeRegex(rawSearch);
            const searchRegex = new RegExp(escapedSearch, 'i');
            const orConditions: any[] = [
                { orderId: searchRegex },
                { orderNumber: searchRegex },
            ];

            if (mongoose.Types.ObjectId.isValid(rawSearch)) {
                const objectId = new mongoose.Types.ObjectId(rawSearch);
                orConditions.push(
                    { _id: objectId },
                    { userId: objectId },
                    { clientId: objectId },
                    { invoiceId: objectId }
                );
            }

            const matchingClients = await Client.find({
                $or: [
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                    { companyName: searchRegex },
                    { contactEmail: searchRegex },
                    { phoneNumber: searchRegex },
                    {
                        $expr: {
                            $regexMatch: {
                                input: {
                                    $trim: {
                                        input: {
                                            $concat: [
                                                { $ifNull: ['$firstName', ''] },
                                                ' ',
                                                { $ifNull: ['$lastName', ''] },
                                            ],
                                        },
                                    },
                                },
                                regex: escapedSearch,
                                options: 'i',
                            },
                        },
                    },
                ],
            })
                .select('_id')
                .lean();

            if (matchingClients.length > 0) {
                orConditions.push({ clientId: { $in: matchingClients.map((client: any) => client._id) } });
            }

            const matchingInvoices = await Invoice.find({ invoiceNumber: searchRegex }).select('_id').lean();
            if (matchingInvoices.length > 0) {
                orConditions.push({ invoiceId: { $in: matchingInvoices.map((invoice: any) => invoice._id) } });
            }

            query.$or = orConditions;
        }

        const [orders, totalResults]: [any[], number] = await Promise.all([
            Order.find(query)
                .populate('clientId', 'firstName lastName contactEmail')
                .populate('invoiceId', 'paymentMethod total status')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Order.countDocuments(query),
        ]);

        const results = orders.map((order) => ({
            _id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            clientId: order.clientId?._id || order.clientId,
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
            currency: order.currency || DEFAULT_CURRENCY,
            status: order.status,
        }));

        return {
            results,
            page,
            limit,
            totalPages: Math.ceil(totalResults / limit),
            totalResults,
        };
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

    /** Update order status. Admin/staff only. */
    async updateOrderStatus(orderId: string, status: OrderStatus) {
        const _id = this.ensureObjectId(orderId, 'Order ID');
        const order = await Order.findById(_id);
        if (!order) throw new Error('Order not found');
        if (!Object.values(OrderStatus).includes(status)) {
            throw new Error('Invalid order status');
        }
        order.status = status;
        await order.save();
        return this.getOrderWithItems(orderId);
    }

    /** Bulk update order status. Admin/staff only. */
    async bulkUpdateOrderStatus(orderIds: string[], status: OrderStatus) {
        const ids = orderIds.map((id) => this.ensureObjectId(id, 'Order ID'));
        const result = await Order.updateMany({ _id: { $in: ids } }, { $set: { status } });
        return { updated: result.modifiedCount, total: ids.length };
    }

    /** Bulk cancel orders (set status to CANCELLED). */
    async bulkCancelOrders(orderIds: string[]) {
        return this.bulkUpdateOrderStatus(orderIds, OrderStatus.CANCELLED);
    }

    /** Bulk accept orders (set status to ACTIVE). */
    async bulkAcceptOrders(orderIds: string[]) {
        return this.bulkUpdateOrderStatus(orderIds, OrderStatus.ACTIVE);
    }

    /** Bulk delete orders (soft delete: set meta.deleted). */
    async bulkDeleteOrders(orderIds: string[]) {
        const ids = orderIds.map((id) => this.ensureObjectId(id, 'Order ID'));
        const result = await Order.updateMany(
            { _id: { $in: ids } },
            {
                $set: {
                    status: OrderStatus.CANCELLED,
                    'meta.deleted': true,
                    'meta.deletedAt': new Date(),
                },
            }
        );
        return { deleted: result.modifiedCount, total: ids.length };
    }

    /** Bulk send message (email) to clients of selected orders. One email per unique client. */
    async bulkSendMessage(
        orderIds: string[],
        subject: string,
        message: string,
        _actorUserId: string
    ): Promise<{ sent: number; failed: number; total: number }> {
        const ids = orderIds.map((id) => this.ensureObjectId(id, 'Order ID'));
        const orders = await Order.find({ _id: { $in: ids } }).select('clientId').lean();
        const clientIds = [...new Set(orders.map((o: any) => o.clientId?.toString()).filter(Boolean))];
        const clientObjectIds = clientIds.map((id) => new mongoose.Types.ObjectId(id));
        const clients = await Client.find({ _id: { $in: clientObjectIds } })
            .populate('user', 'email')
            .lean();

        let sent = 0;
        let failed = 0;
        const senderLabel = 'Support Team';

        for (const client of clients) {
            const c = client as any;
            const email = c.contactEmail || c.user?.email;
            if (!email) {
                failed++;
                continue;
            }
            const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;"><p>${(message || '').replace(/\n/g, '<br>')}</p><hr/><p style="color:#666;font-size:12px;">Sent by ${senderLabel}</p></body></html>`;
            const result = await emailService.sendEmail({
                to: email,
                subject: subject || 'Message from Support',
                text: message,
                html,
            });
            if (result.success) sent++;
            else failed++;
        }

        return { sent, failed, total: clients.length };
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
                        firstName: '$client.firstName',
                        lastName: '$client.lastName',
                        name: { $concat: ['$client.firstName', ' ', '$client.lastName'] },
                        email: '$client.contactEmail',
                        companyName: '$client.companyName',
                        phoneNumber: '$client.phoneNumber',
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

        const orderData = result[0] || null;
        if (!orderData?.items?.length) return orderData;

        const orderItemIds = orderData.items.map((i: any) => i._id);
        const services = await Service.find({ orderItemId: { $in: orderItemIds } })
            .select('orderItemId status provisioning')
            .lean();
        const serviceByOrderItemId = new Map(services.map((s: any) => [s.orderItemId.toString(), s]));

        orderData.items = orderData.items.map((item: any) => {
            const sid = item._id?.toString();
            const service = sid ? serviceByOrderItemId.get(sid) : null;
            const { meta, ...rest } = item;
            const safeMeta = meta ? { ...meta } : {};
            delete safeMeta.password;
            return {
                ...rest,
                meta: Object.keys(safeMeta).length ? safeMeta : undefined,
                username: meta?.accountUsername ?? null,
                domain: item.configSnapshot?.primaryDomain ?? item.configSnapshot?.domain ?? item.domain ?? null,
                provisioningStatus: service?.status ?? null,
                provisioningError: service?.provisioning?.lastError ?? null,
            };
        });

        return orderData;
    }

    /**
     * Create a single cPanel account for an order item (shared by runModuleCreate and provisioning worker).
     * Picks server by location + product server group, creates account via WHM, optionally updates order item meta.
     */
    async createHostingAccountForOrderItem(
        orderItem: any,
        order: any,
        clientEmail: string,
        options: {
            serverId?: string;
            whmPackage?: string;
            username?: string;
            password?: string;
            updateOrderItemMeta?: boolean;
            sendWelcomeEmail?: boolean;
            forceCreate?: boolean;
        } = {}
    ): Promise<CreateHostingAccountResult> {
        const {
            serverId: chosenServerId,
            whmPackage: chosenPackage,
            username: chosenUsername,
            password: chosenPassword,
            updateOrderItemMeta = true,
            sendWelcomeEmail = false,
            forceCreate = false,
        } = options;

        const existingMeta = orderItem?.meta;
        if (!forceCreate && existingMeta?.accountUsername) {
            const primaryDomain = String(orderItem?.configSnapshot?.primaryDomain ?? orderItem?.configSnapshot?.domain ?? '').trim();
            const whmPackageName = existingMeta.whmPackage || '';
            return {
                serverId: existingMeta.serverId,
                accountUsername: existingMeta.accountUsername,
                primaryDomain: primaryDomain || 'unknown',
                whmPackageName,
                details: {
                    primaryDomain: primaryDomain || 'unknown',
                    serverId: existingMeta.serverId,
                    controlPanel: ControlPanelType.CPANEL,
                    packageId: orderItem?.productId?.toString() || '',
                    accountUsername: existingMeta.accountUsername,
                    accountRemoteId: existingMeta.accountUsername,
                    assignedIp: undefined,
                    nameservers: [],
                    resourceLimits: { diskMb: 10000, bandwidthMb: 100000, inodeLimit: 100000 },
                    sslEnabled: true,
                    dedicatedIp: false,
                },
                actuallyCreated: false,
            };
        }

        const config = orderItem?.configSnapshot || {};
        const primaryDomain = String(config.primaryDomain ?? config.domain ?? '').trim();
        if (!primaryDomain) {
            throw new Error('Primary domain is required for cPanel account creation');
        }
        const location = config.serverLocation ? String(config.serverLocation).toLowerCase() : '';
        const serverGroup = config.serverGroup || '';
        const product = await Product.findById(orderItem?.productId).lean();
        const productServerGroup = serverGroup || (product as any)?.module?.serverGroup;
        const defaultPackageName = (product as any)?.module?.packageName || '';
        const whmPackageName = chosenPackage || defaultPackageName;

        let serverId = chosenServerId;
        if (!serverId) {
            const candidateServers = await Server.find({ isEnabled: true }).lean();
            if (candidateServers.length === 0) {
                throw new Error('No servers configured. Add at least one server in Admin → Servers and ensure it is enabled.');
            }
            const locMatch = (s: any) => !location || String(s.location || '').toLowerCase() === location;
            const groupMatch = (s: any) => {
                const groups = Array.isArray(s.groups) ? s.groups : (s.group ? [s.group] : []);
                if (!productServerGroup) return true;
                return groups.length === 0 || groups.includes(productServerGroup);
            };
            const eligible = candidateServers.filter((s: any) => locMatch(s) && groupMatch(s));
            const serversToConsider = eligible.length > 0 ? eligible : candidateServers;
            const withCount = await Promise.all(serversToConsider.map(async (s: any) => {
                const { count, error } = await serverService.getWhmAccountCount(s._id.toString());
                // When WHM account count cannot be read (error), use 0 so the server can still be selected; createAccount will fail with a clear error if WHM is unreachable.
                const effectiveCount = error ? 0 : count;
                return { server: s, count: effectiveCount, maxAccounts: s.maxAccounts ?? 200, countError: error };
            }));
            const withCapacity = withCount.filter((w: any) => w.count < w.maxAccounts);
            withCapacity.sort((a: any, b: any) => a.count - b.count);
            const picked = withCapacity[0]?.server;
            if (!picked) {
                const allHadCountErrors = withCount.every((w: any) => w.countError);
                throw new Error(allHadCountErrors
                    ? 'WHM account count could not be read for any server. Check Admin → Servers: WHM API token and connectivity.'
                    : 'No server with capacity (all servers at or over max accounts). Increase Max Accounts in Admin → Servers or add another server.');
            }
            serverId = picked._id.toString();
        }
        if (!serverId) {
            throw new Error('No server selected for hosting account');
        }

        const whmResult = await serverService.getWhmClientOrError(serverId);
        if ('error' in whmResult) {
            throw new Error(whmResult.error);
        }
        const whmClient = whmResult.client;

        let username = chosenUsername;
        if (!username) {
            const base = primaryDomain.replace(/^www\./, '').split('/')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
            username = `${base}${Math.floor(100 + Math.random() * 900)}`.slice(0, 16);
        }
        username = String(username).trim().slice(0, 16);
        if (!username) {
            throw new Error('Username required');
        }

        const password = chosenPassword || generateHostingAccountPassword();
        const email = clientEmail || `admin@${primaryDomain}`;
        await whmClient.createAccount({
            username,
            domain: primaryDomain,
            plan: whmPackageName || 'default',
            email,
            password,
        });

        if (updateOrderItemMeta && orderItem?._id) {
            await OrderItem.findByIdAndUpdate(orderItem._id, {
                $set: {
                    meta: {
                        serverId,
                        accountUsername: username,
                        whmPackage: whmPackageName,
                        /* password intentionally omitted - never persist credentials */
                    },
                },
            });
        }

        if (sendWelcomeEmail && clientEmail) {
            try {
                const clientName = (order as any)?.client?.name || 'Customer';
                await emailService.sendWelcomeEmail(clientEmail, clientName);
            } catch (_) { /* optional */ }
        }

        const nameservers: string[] = [];
        try {
            const serverDoc = await Server.findById(serverId).select('nameservers').lean();
            const ns = (serverDoc as any)?.nameservers;
            if (ns) {
                if (ns.ns1) nameservers.push(ns.ns1);
                if (ns.ns2) nameservers.push(ns.ns2);
                if (ns.ns3) nameservers.push(ns.ns3);
                if (ns.ns4) nameservers.push(ns.ns4);
                if (ns.ns5) nameservers.push(ns.ns5);
            }
        } catch (_) { /* optional */ }

        const details: Record<string, unknown> = {
            primaryDomain,
            serverId,
            controlPanel: ControlPanelType.CPANEL,
            packageId: orderItem?.productId?.toString() || '',
            accountUsername: username,
            accountRemoteId: username,
            assignedIp: undefined,
            nameservers,
            resourceLimits: { diskMb: 10000, bandwidthMb: 100000, inodeLimit: 100000 },
            sslEnabled: true,
            dedicatedIp: false,
        };

        return { serverId, accountUsername: username, primaryDomain, whmPackageName, details, actuallyCreated: true, password };
    }

    /**
     * Run module create for hosting items: pick server (by location + group, fill until full),
     * create cPanel account via WHM, optionally send welcome email.
     * Body: { items: [{ itemIndex, serverId?, whmPackage?, username?, password?, runModuleCreate, sendWelcomeEmail }] }
     */
    async runModuleCreate(orderId: string, body: { items: Array<{
        itemIndex: number;
        orderItemId?: string;
        serverId?: string;
        whmPackage?: string;
        username?: string;
        password?: string;
        runModuleCreate?: boolean;
        sendWelcomeEmail?: boolean;
    }> }, _userId?: string) {
        const order = await this.getOrderWithItems(orderId);
        if (!order) throw new Error('Order not found');
        const items = await this.getOrderItemsByOrderId(orderId);
        let clientEmail = (order as any).client?.email || '';
        if (!clientEmail) {
            const orderDoc = await Order.findById(orderId).select('clientId').lean();
            const clientDoc = orderDoc?.clientId ? await Client.findById(orderDoc.clientId).select('contactEmail').lean() : null;
            clientEmail = clientDoc?.contactEmail || '';
        }
        const results: Array<{ itemIndex: number; success: boolean; serverId?: string; accountUsername?: string; error?: string; created?: boolean }> = [];

        for (const spec of body.items || []) {
            const { itemIndex, orderItemId: specOrderItemId, serverId: chosenServerId, whmPackage: chosenPackage, username: chosenUsername, password: chosenPassword, runModuleCreate, sendWelcomeEmail } = spec;
            const item = specOrderItemId
                ? items.find((i: any) => String(i._id) === String(specOrderItemId))
                : items[itemIndex];
            if (!item || (item as any).type !== ServiceType.HOSTING) {
                results.push({ itemIndex, success: false, error: 'Item not found or not HOSTING' });
                continue;
            }
            if (!runModuleCreate) {
                results.push({ itemIndex, success: true });
                continue;
            }

            try {
                const created = await this.createHostingAccountForOrderItem(
                    item,
                    order,
                    clientEmail,
                    {
                        serverId: chosenServerId,
                        whmPackage: chosenPackage,
                        username: chosenUsername,
                        password: chosenPassword,
                        updateOrderItemMeta: true,
                        sendWelcomeEmail: !!sendWelcomeEmail,
                    }
                );
                const { auditLogSafe } = await import('../activity-log/activity-log.service');
                auditLogSafe({
                    message: created.actuallyCreated !== false ? `Hosting module created for order ${orderId}: ${created.accountUsername}@${created.primaryDomain}` : `Hosting module linked for order ${orderId}`,
                    type: 'module_created',
                    category: 'service',
                    actorType: _userId ? 'user' : 'system',
                    actorId: _userId,
                    source: 'manual',
                    targetType: 'order',
                    targetId: orderId,
                    clientId: (order as any).clientId?.toString?.(),
                    orderId,
                    meta: { serverId: created.serverId, accountUsername: created.accountUsername, primaryDomain: created.primaryDomain, actuallyCreated: created.actuallyCreated } as Record<string, unknown>,
                });
                results.push({
                    itemIndex,
                    success: true,
                    serverId: created.serverId,
                    accountUsername: created.accountUsername,
                    created: created.actuallyCreated !== false,
                });
            } catch (err: any) {
                results.push({
                    itemIndex,
                    success: false,
                    error: err?.message || 'Hosting account creation failed',
                });
            }
        }

        return { results };
    }
}

export const orderService = new OrderService();
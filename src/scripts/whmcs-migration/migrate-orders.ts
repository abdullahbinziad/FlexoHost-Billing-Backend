/**
 * Migrate WHMCS tblorders + tblorderitems → FlexoHost Order + OrderItem
 */
import mysql from 'mysql2/promise';
import Order from '../../modules/order/order.model';
import OrderItem from '../../modules/order/order-item.model';
import { getFlexohostId, setMapping } from './id-mapping.model';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import { ServiceType, BillingCycle } from '../../modules/services/types/enums';
import { OrderStatus } from '../../modules/order/order.interface';

const WHMCS_STATUS_MAP: Record<string, string> = {
    Pending: OrderStatus.PENDING_PAYMENT,
    Active: OrderStatus.ACTIVE,
    Cancelled: OrderStatus.CANCELLED,
    Fraud: OrderStatus.CANCELLED,
    Refunded: OrderStatus.CANCELLED,
};

const WHMCS_BILLING_MAP: Record<string, string> = {
    monthly: BillingCycle.MONTHLY,
    quarterly: BillingCycle.QUARTERLY,
    semiannually: BillingCycle.SEMIANNUALLY,
    annually: BillingCycle.ANNUALLY,
    biennially: BillingCycle.BIENNIALLY,
    triennially: BillingCycle.TRIENNIALLY,
    onetime: BillingCycle.ONE_TIME,
    free: BillingCycle.ONE_TIME,
};

function mapBillingCycle(v: string): string {
    const k = (v || 'monthly').toLowerCase().replace(/[\s-]/g, '');
    return WHMCS_BILLING_MAP[k] || BillingCycle.MONTHLY;
}

function mapProductType(whmcsType: string): string {
    const t = (whmcsType || '').toLowerCase();
    if (t.includes('domain') || t.includes('dom')) return ServiceType.DOMAIN;
    if (t.includes('hosting') || t.includes('shared')) return ServiceType.HOSTING;
    if (t.includes('vps') || t.includes('server')) return ServiceType.VPS;
    if (t.includes('ssl')) return ServiceType.HOSTING;
    return ServiceType.HOSTING;
}

export async function migrateOrders(conn: mysql.Connection, dryRun: boolean): Promise<number> {
    const [orders] = await conn.query<any[]>('SELECT * FROM tblorders ORDER BY id ASC');
    let count = 0;

    for (const o of orders || []) {
        const whmcsOrderId = o.id;
        const existing = await getFlexohostId('order', whmcsOrderId);
        if (existing) continue;

        const clientId = await getFlexohostId('client', o.userid);
        if (!clientId) {
            console.warn(`Order ${whmcsOrderId}: client ${o.userid} not found, skipping`);
            continue;
        }

        const userId = await getFlexohostId('user_client', o.userid);
        if (!userId) continue;

        if (dryRun) {
            console.log(`[DRY-RUN] Would migrate order ${whmcsOrderId}`);
            count++;
            continue;
        }

        const orderSeq = await getNextSequence('order');
        const orderId = formatSequenceId('ORD', orderSeq);
        const orderNumber = (o.ordernum || o.id || orderSeq).toString();

        const status = WHMCS_STATUS_MAP[o.status] || OrderStatus.PENDING_PAYMENT;
        const total = parseFloat(o.amount || 0) || 0;
        const subtotal = parseFloat(o.subtotal || o.amount || 0) || total;
        const discount = parseFloat(o.discount || 0) || 0;
        const tax = parseFloat(o.tax || 0) || 0;
        const currency = (o.currency || 'USD').toString().toUpperCase().slice(0, 3);

        const order = await Order.create({
            orderId,
            orderNumber,
            clientId,
            userId,
            status,
            currency,
            subtotal,
            discountTotal: discount,
            taxTotal: tax,
            total,
            paidAt: o.datepaid ? new Date(o.datepaid) : undefined,
        });

        await setMapping('order', whmcsOrderId, order._id);

        let items: any[] = [];
        try {
            const [itemsResult] = await conn.query<any[]>(
                'SELECT * FROM tblorderitems WHERE orderid = ? ORDER BY id',
                [whmcsOrderId]
            );
            items = itemsResult || [];
        } catch {
            // tblorderitems may not exist in older WHMCS
        }

        if (items.length === 0) {
            await OrderItem.create({
                orderId: order._id,
                clientId,
                type: ServiceType.HOSTING,
                nameSnapshot: `Order #${orderNumber}`,
                billingCycle: BillingCycle.MONTHLY,
                qty: 1,
                pricingSnapshot: {
                    setup: 0,
                    recurring: total,
                    discount: 0,
                    tax: 0,
                    total,
                    currency,
                },
                configSnapshot: { whmcsOrderId },
            });
        } else {
            for (const it of items) {
                const productId = await getFlexohostId('product', it.productid);
                const cycle = mapBillingCycle(it.billingcycle || 'monthly');
                const amount = parseFloat(it.amount || 0) || 0;

                await OrderItem.create({
                    orderId: order._id,
                    clientId,
                    type: mapProductType(it.type || 'hosting'),
                    productId: productId?.toString(),
                    nameSnapshot: (it.name || it.productname || 'Item').trim(),
                    billingCycle: cycle,
                    qty: parseInt(it.qty || 1, 10) || 1,
                    pricingSnapshot: {
                        setup: parseFloat(it.setup || 0) || 0,
                        recurring: amount,
                        discount: 0,
                        tax: 0,
                        total: amount,
                        currency,
                    },
                    configSnapshot: {
                        domain: it.domainname || it.domain || '',
                        type: it.type || 'hosting',
                        whmcsId: it.id,
                    },
                });
            }
        }

        count++;
    }

    return count;
}

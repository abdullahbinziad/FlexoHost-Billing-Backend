/**
 * Migrate WHMCS tblhosting + tbldomains → FlexoHost Service
 */
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import Service from '../../modules/services/service.model';
import { getFlexohostId, setMapping } from './id-mapping.model';
import { getNextSequence } from '../../models/counter.model';
import { ServiceType, ServiceStatus, BillingCycle } from '../../modules/services/types/enums';

const STATUS_MAP: Record<string, string> = {
    Pending: ServiceStatus.PENDING,
    Active: ServiceStatus.ACTIVE,
    Suspended: ServiceStatus.SUSPENDED,
    Terminated: ServiceStatus.TERMINATED,
    Cancelled: ServiceStatus.CANCELLED,
    Fraud: ServiceStatus.TERMINATED,
};

const CYCLE_MAP: Record<string, string> = {
    monthly: BillingCycle.MONTHLY,
    quarterly: BillingCycle.QUARTERLY,
    semiannually: BillingCycle.SEMIANNUALLY,
    annually: BillingCycle.ANNUALLY,
    biennially: BillingCycle.BIENNIALLY,
    triennially: BillingCycle.TRIENNIALLY,
    onetime: BillingCycle.ONE_TIME,
    free: BillingCycle.ONE_TIME,
};

function mapCycle(v: string): string {
    const k = (v || 'monthly').toLowerCase().replace(/[\s-]/g, '');
    return CYCLE_MAP[k] || BillingCycle.MONTHLY;
}

export async function migrateServices(conn: mysql.Connection, dryRun: boolean): Promise<number> {
    let count = 0;

    const [hosting] = await conn.query<any[]>('SELECT * FROM tblhosting ORDER BY id ASC');
    for (const h of hosting || []) {
        const whmcsId = h.id;
        const existing = await getFlexohostId('service_hosting', whmcsId);
        if (existing) continue;

        const clientId = await getFlexohostId('client', h.userid);
        const orderId = await getFlexohostId('order', h.orderid);
        const invoiceId = h.invoiceid ? await getFlexohostId('invoice', h.invoiceid) : undefined;
        if (!clientId || !orderId) continue;

        if (dryRun) {
            console.log(`[DRY-RUN] Would migrate hosting ${whmcsId}: ${h.domain}`);
            count++;
            continue;
        }

        const orderItems = await mongoose.model('OrderItem').find({ orderId }).limit(1).lean();
        const orderItemId = orderItems[0]?._id || new mongoose.Types.ObjectId();

        const svcSeq = await getNextSequence('service');
        const serviceNumber = `SVC-${String(svcSeq).padStart(6, '0')}`;
        const amount = parseFloat(h.amount || 0) || 0;
        const currency = (h.currency || 'USD').toString().slice(0, 3);

        const service = await Service.create({
            serviceNumber,
            clientId,
            orderId,
            orderItemId,
            invoiceId,
            type: ServiceType.HOSTING,
            status: STATUS_MAP[h.domainstatus] || ServiceStatus.ACTIVE,
            billingCycle: mapCycle(h.billingcycle),
            currency,
            priceSnapshot: { setup: 0, recurring: amount, discount: 0, tax: 0, total: amount, currency },
            autoRenew: (h.dontrenew || 0) == 0,
            nextDueDate: h.nextduedate ? new Date(h.nextduedate) : new Date(),
            suspendedAt: h.suspended_at ? new Date(h.suspended_at) : undefined,
            meta: { whmcsId, domain: h.domain, username: h.username },
        });

        await setMapping('service_hosting', whmcsId, service._id);
        count++;
    }

    const [domains] = await conn.query<any[]>('SELECT * FROM tbldomains ORDER BY id ASC');
    for (const d of domains || []) {
        const whmcsId = d.id;
        const existing = await getFlexohostId('service_domain', whmcsId);
        if (existing) continue;

        const clientId = await getFlexohostId('client', d.userid);
        const orderId = await getFlexohostId('order', d.orderid);
        const invoiceId = d.invoiceid ? await getFlexohostId('invoice', d.invoiceid) : undefined;
        if (!clientId || !orderId) continue;

        if (dryRun) {
            console.log(`[DRY-RUN] Would migrate domain ${whmcsId}: ${d.domain}`);
            count++;
            continue;
        }

        const orderItems = await mongoose.model('OrderItem').find({ orderId }).limit(1).lean();
        const orderItemId = orderItems[0]?._id || new mongoose.Types.ObjectId();

        const svcSeq = await getNextSequence('service');
        const serviceNumber = `SVC-${String(svcSeq).padStart(6, '0')}`;
        const amount = parseFloat(d.recurringamount || 0) || 0;
        const currency = (d.currency || 'USD').toString().slice(0, 3);

        const service = await Service.create({
            serviceNumber,
            clientId,
            orderId,
            orderItemId,
            invoiceId,
            type: ServiceType.DOMAIN,
            status: STATUS_MAP[d.status] || ServiceStatus.ACTIVE,
            billingCycle: mapCycle(d.registrationperiod || 'annually'),
            currency,
            priceSnapshot: { setup: 0, recurring: amount, discount: 0, tax: 0, total: amount, currency },
            autoRenew: (d.dontrenew || 0) == 0,
            nextDueDate: d.expirydate ? new Date(d.expirydate) : new Date(),
            meta: { whmcsId, domain: d.domain, registrar: d.registrar },
        });

        await setMapping('service_domain', whmcsId, service._id);
        count++;
    }

    return count;
}

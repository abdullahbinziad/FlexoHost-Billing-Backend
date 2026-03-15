/**
 * Migrate WHMCS tblinvoices + tblinvoiceitems → FlexoHost Invoice
 */
import mysql from 'mysql2/promise';
import Invoice from '../../modules/invoice/invoice.model';
import { InvoiceItemType } from '../../modules/invoice/invoice.interface';
import Client from '../../modules/client/client.model';
import { getFlexohostId, setMapping } from './id-mapping.model';
import { getNextSequence } from '../../models/counter.model';
import { InvoiceStatus } from '../../modules/invoice/invoice.interface';

const STATUS_MAP: Record<string, string> = {
    Unpaid: InvoiceStatus.UNPAID,
    Paid: InvoiceStatus.PAID,
    Cancelled: InvoiceStatus.CANCELLED,
    Refunded: InvoiceStatus.CANCELLED,
    Collection: InvoiceStatus.OVERDUE,
};

export async function migrateInvoices(conn: mysql.Connection, dryRun: boolean): Promise<number> {
    const [rows] = await conn.query<any[]>('SELECT * FROM tblinvoices ORDER BY id ASC');
    let count = 0;

    for (const r of rows || []) {
        const whmcsId = r.id;
        const existing = await getFlexohostId('invoice', whmcsId);
        if (existing) continue;

        const clientId = await getFlexohostId('client', r.userid);
        if (!clientId) continue;

        const orderId = r.orderid ? await getFlexohostId('order', r.orderid) : undefined;

        if (dryRun) {
            console.log(`[DRY-RUN] Would migrate invoice ${whmcsId}`);
            count++;
            continue;
        }

        let items: any[] = [];
        try {
            const [itemsResult] = await conn.query<any[]>(
                'SELECT * FROM tblinvoiceitems WHERE invoiceid = ? ORDER BY id',
                [whmcsId]
            );
            items = itemsResult || [];
        } catch {
            // Column might be invid in some WHMCS versions
            try {
                const [alt] = await conn.query<any[]>('SELECT * FROM tblinvoiceitems WHERE invid = ? ORDER BY id', [whmcsId]);
                items = alt || [];
            } catch {
                items = [];
            }
        }

        const invoiceItems: any[] = [];
        let subTotal = 0;
        for (const it of items || []) {
            const amt = parseFloat(it.amount || 0) || 0;
            subTotal += amt;
            invoiceItems.push({
                type: InvoiceItemType.HOSTING,
                description: (it.description || 'Item').trim(),
                amount: amt,
                period: it.duedate ? { startDate: new Date(it.duedate), endDate: new Date(it.duedate) } : undefined,
                meta: { whmcsId: it.id },
            });
        }

        if (invoiceItems.length === 0) {
            invoiceItems.push({
                type: InvoiceItemType.HOSTING,
                description: `Invoice #${r.invoicenum || whmcsId}`,
                amount: parseFloat(r.total || 0) || 0,
            });
            subTotal = parseFloat(r.total || 0) || 0;
        }

        const total = parseFloat(r.total || 0) || subTotal;
        const discount = parseFloat(r.credit || 0) || 0;
        const credit = parseFloat(r.credit || 0) || 0;
        const status = STATUS_MAP[r.status] || InvoiceStatus.UNPAID;
        const currency = (r.currency || 'USD').toString().toUpperCase().slice(0, 3);

        const invSeq = await getNextSequence('invoice');
        const invoiceNumber = (r.invoicenum || r.id || invSeq).toString();

        const client = await Client.findById(clientId).select('firstName lastName companyName address').lean();
        const c = client as any;
        const customerName = (r.firstname && r.lastname)
            ? `${r.firstname} ${r.lastname}`.trim()
            : (c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : '') || 'Customer';
        const companyName = (r.companyname || (c?.companyName || '')).trim();
        const addr = c?.address;
        const address = (r.address1 || r.address || (addr ? [addr.street, addr.city, addr.country].filter(Boolean).join(', ') : '')).trim() || '-';
        const country = (r.country || addr?.country || '').trim() || '-';

        const invoice = await Invoice.create({
            clientId,
            invoiceNumber,
            status,
            invoiceDate: r.date ? new Date(r.date) : new Date(),
            dueDate: r.duedate ? new Date(r.duedate) : new Date(),
            billedTo: {
                companyName: companyName || undefined,
                customerName: customerName || 'Customer',
                address: address || '-',
                country: country || '-',
            },
            items: invoiceItems,
            currency,
            subTotal,
            discount,
            credit,
            total,
            balanceDue: status === InvoiceStatus.PAID ? 0 : Math.max(0, total - credit),
            orderId,
        });

        await setMapping('invoice', whmcsId, invoice._id);
        count++;
    }

    return count;
}

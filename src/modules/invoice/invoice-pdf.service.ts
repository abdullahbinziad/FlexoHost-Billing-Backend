/**
 * Invoice PDF: render portal’s exact HTML (invoice-pdf-html.ts) via Puppeteer.
 * Same structure and design as /invoices/[id] (InvoiceDetail + InvoiceHeader + InvoiceBody).
 */

import type { IInvoiceDocument } from './invoice.interface';
import PaymentTransaction from '../transaction/transaction.model';
import { buildInvoiceHtml, type InvoicePdfData } from './invoice-pdf-html';
import config from '../../config';

export type InvoiceForPdf = IInvoiceDocument;

export interface TransactionForPdf {
    date: Date;
    gateway: string;
    transactionId: string;
    amount: number;
}

const PAY_TO = {
    get name() {
        return config.app.companyName;
    },
    get email() {
        return config.app.companyEmail;
    },
    get address() {
        return config.app.companyAddress;
    },
};

/** Invoiced address: same as portal formatInvoicedAddress – address • country */
function formatInvoicedAddress(address: string, country: string): string {
    const a = (address || '').trim();
    const c = (country || '').trim();
    if (!a && !c) return '—';
    if (!a) return c;
    return c ? `${a} • ${c}` : a;
}

function toPdfData(inv: any, transactions: TransactionForPdf[]): InvoicePdfData {
    const billedTo = inv.billedTo || {};
    const status = (inv.status || 'UNPAID').toString().toLowerCase();
    return {
        invoiceNumber: inv.invoiceNumber || '—',
        status,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        paymentMethod: inv.paymentMethod || undefined,
        payTo: {
            name: PAY_TO.name,
            email: PAY_TO.email,
            address: PAY_TO.address,
        },
        invoicedTo: {
            companyName: billedTo.companyName,
            name: billedTo.customerName || '—',
            addressFormatted: formatInvoicedAddress(billedTo.address || '', billedTo.country || ''),
        },
        note: inv.note,
        items: (inv.items || []).map((i: any) => ({
            description: i.description || 'Item',
            amount: Number(i.amount ?? 0),
        })),
        subtotal: Number(inv.subTotal ?? 0),
        credit: Number(inv.credit ?? 0),
        total: Number(inv.total ?? 0),
        balance: Number(inv.balanceDue ?? inv.total ?? 0),
        currency: inv.currency || 'BDT',
        transactions: transactions.map((t) => ({
            date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
            gateway: t.gateway || '—',
            transactionId: t.transactionId || '—',
            amount: t.amount,
        })),
    };
}

export async function generateInvoicePdf(
    invoice: IInvoiceDocument | InvoiceForPdf,
    options?: { transactions?: TransactionForPdf[] }
): Promise<Buffer> {
    const inv = invoice as any;
    const transactions = options?.transactions ?? [];
    const data = toPdfData(inv, transactions);
    const html = buildInvoiceHtml(data);

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.emulateMediaType('print');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
        return Buffer.from(pdfBuffer);
    } finally {
        await browser.close();
    }
}

export async function getInvoicePdfBuffer(invoice: IInvoiceDocument | InvoiceForPdf): Promise<Buffer> {
    const inv = invoice as any;
    const id = inv._id;
    let transactions: TransactionForPdf[] = [];
    if (id) {
        const txs = await PaymentTransaction.find({ invoiceId: id })
            .sort({ createdAt: 1 })
            .lean();
        transactions = txs.map((t: any) => ({
            date: t.createdAt ? new Date(t.createdAt) : new Date(),
            gateway: t.gateway || '—',
            transactionId: t.externalTransactionId || '—',
            amount: Number(t.amount || 0),
        }));
    }
    return generateInvoicePdf(invoice, { transactions });
}

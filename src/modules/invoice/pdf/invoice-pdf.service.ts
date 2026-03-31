/**
 * Invoice PDF: render portal’s exact HTML (invoice-pdf-html.ts) via Puppeteer.
 * Same structure and design as /invoices/[id] (InvoiceDetail + InvoiceHeader + InvoiceBody).
 */

import config from '../../../config';
import type { IInvoiceDocument } from '../invoice.interface';
import PaymentTransaction from '../../transaction/transaction.model';
import { buildInvoiceHtml, type InvoicePdfData } from './invoice-pdf-html';

export type InvoiceForPdf = IInvoiceDocument;

export interface TransactionForPdf {
    date: Date;
    gateway: string;
    transactionId: string;
    amount: number;
}

const PAY_TO = {
    name: process.env.COMPANY_NAME || 'FlexoHost',
    email: process.env.COMPANY_EMAIL || 'billing@flexohost.com',
    address: process.env.COMPANY_ADDRESS || 'Ghunti, Mymensingh Sadar, Mymensingh, Bangladesh, Post-2200',
};

const INVOICE_PDF_LOGO_URL =
    process.env.INVOICE_PDF_LOGO_URL?.trim() ||
    'https://res.cloudinary.com/dzmglrehf/image/upload/v1774877112/FlexoHostHorizontalforLight_gszd0a.webp';

/** Invoiced address: same as portal formatInvoicedAddress – address • country */
function formatInvoicedAddress(address: string, country: string): string {
    const a = (address || '').trim();
    const c = (country || '').trim();
    if (!a && !c) return '—';
    if (!a) return c;
    return c ? `${a} • ${c}` : a;
}

/** Inline image for Puppeteer so PDF does not depend on remote fetch at render time. */
async function fetchLogoAsDataUri(logoUrl: string): Promise<string | undefined> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        const res = await fetch(logoUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'FlexoHost-InvoicePdf/1.0' },
        });
        clearTimeout(timer);
        if (!res.ok) return undefined;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 2 * 1024 * 1024) return undefined;
        let mime = (res.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
        if (!mime.startsWith('image/')) mime = 'image/png';
        return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
        return undefined;
    }
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
    const rawLogo = INVOICE_PDF_LOGO_URL || config.email?.logoUrl?.trim();
    let logoSrc: string | undefined;
    if (rawLogo) {
        logoSrc = (await fetchLogoAsDataUri(rawLogo)) || rawLogo;
    }
    const html = buildInvoiceHtml({
        ...data,
        logoSrc,
        companyName: config.app.companyName,
    });

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

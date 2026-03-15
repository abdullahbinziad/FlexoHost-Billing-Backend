import Invoice from './invoice.model';
import Client from '../client/client.model';
import { IInvoice, IInvoiceDocument, InvoiceStatus, InvoiceItemType } from './invoice.interface';
import ApiError from '../../utils/apiError';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import { handleInvoicePaid } from '../services/services';
import serviceLifecycleService from '../services/services/service-lifecycle.service';
import { notificationProvider } from '../services/providers/notification.provider';
import { buildSort, getPagination } from '../../utils/pagination';
import PaymentTransaction from '../transaction/transaction.model';
import { TransactionStatus, TransactionType } from '../transaction/transaction.interface';
import notificationService from '../notification/notification.service';
import * as emailService from '../email/email.service';
import { getInvoicePdfBuffer } from './invoice-pdf.service';
import config from '../../config';
import logger from '../../utils/logger';
import { BASE_REPORTING_CURRENCY } from '../../config/currency.config';
import { buildInvoiceFxSnapshot, fallbackToBase, getRateFromBaseToDisplay } from '../exchange-rate/fx.service';
import { affiliateService } from '../affiliate/affiliate.service';
import type { ClientSession } from 'mongoose';

interface CreateInvoiceOptions {
    session?: ClientSession;
    sendEmail?: boolean;
}

class InvoiceService {
    /**
     * Set historical FX snapshot at invoice date and sync totalInBase/balanceDueInBase. Never use current rate.
     */
    async setInvoiceFxSnapshot(invoice: IInvoiceDocument, options: { session?: ClientSession } = {}): Promise<void> {
        const { snapshot, isLegacy } = await buildInvoiceFxSnapshot({
            invoiceDate: invoice.invoiceDate,
            currency: invoice.currency,
            subTotal: invoice.subTotal,
            total: invoice.total,
            balanceDue: invoice.balanceDue,
        });
        invoice.fxSnapshot = snapshot;
        invoice.fxSnapshotLegacy = isLegacy;
        invoice.baseCurrency = snapshot.baseCurrency;
        invoice.totalInBase = snapshot.totalInBase;
        invoice.balanceDueInBase = snapshot.balanceDueInBase;
        await invoice.save(options.session ? { session: options.session } : undefined);
    }

    /**
     * Generate a sequential invoice number: INV-000001, INV-000002, ...
     */
    private async generateInvoiceNumber(): Promise<string> {
        const seq = await getNextSequence('invoice');
        return formatSequenceId('INV', seq);
    }

    /**
     * Create a new invoice
     * @param invoiceData Partial invoice data
     * @returns Created invoice document
     */
    async createInvoice(
        invoiceData: Partial<IInvoice>,
        options: CreateInvoiceOptions = {}
    ): Promise<IInvoiceDocument> {
        // Calculate totals first to ensure validation passes or simple overwrite
        const subTotal = invoiceData.items?.reduce((acc, item) => acc + item.amount, 0) || 0;
        const discount = invoiceData.discount ?? 0;
        const total = Math.max(0, subTotal - discount);
        const credit = invoiceData.credit || 0;
        const balanceDue = total - credit;

        const invoiceNumber = await this.generateInvoiceNumber();

        const invoice = options.session
            ? await new Invoice({
                ...invoiceData,
                invoiceNumber,
                status: InvoiceStatus.UNPAID,
                subTotal,
                discount,
                total,
                balanceDue,
            }).save({ session: options.session })
            : await Invoice.create({
                ...invoiceData,
                invoiceNumber,
                status: InvoiceStatus.UNPAID,
                subTotal,
                discount,
                total,
                balanceDue,
            });

        await this.setInvoiceFxSnapshot(invoice, { session: options.session });

        if ((options.sendEmail ?? true) && !invoice.orderId && !options.session) {
            const clientDoc = await Client.findById(invoice.clientId).select('contactEmail firstName lastName').lean();
            const clientEmail = clientDoc?.contactEmail || '';
            const customerName = clientDoc ? `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim() || 'Customer' : 'Customer';
            const baseUrl = config.frontendUrl || (config as any).cors?.origin || 'http://localhost:3000';
            if (clientEmail) {
                try {
                    const lineItems = (invoice.items || []).map((i: any) => ({ label: i.description || 'Item', amount: String(i.amount ?? 0) }));
                    if (lineItems.length === 0) lineItems.push({ label: 'Total', amount: String(invoice.total ?? 0) });
                    let attachments: { filename: string; content: Buffer }[] | undefined;
                    try {
                        const pdfBuffer = await getInvoicePdfBuffer(invoice);
                        attachments = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }];
                    } catch (pdfErr: any) {
                        logger.warn('[Invoice] PDF generation failed, sending email without attachment:', pdfErr?.message);
                    }
                    await emailService.sendTemplatedEmail({
                        to: clientEmail,
                        templateKey: 'billing.invoice_created',
                        props: {
                            customerName,
                            invoiceNumber: invoice.invoiceNumber,
                            dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A',
                            amountDue: String(invoice.balanceDue ?? invoice.total ?? 0),
                            currency: invoice.currency || 'BDT',
                            invoiceUrl: `${baseUrl}/invoices/${invoice._id}`,
                            billingUrl: `${baseUrl}/client`,
                            lineItems,
                        },
                        attachments,
                    });
                } catch (e: any) {
                    logger.warn('[Invoice] Invoice created email failed:', e?.message || e);
                }
            }
        }

        return invoice;
    }

    /**
     * Delete an invoice (admin only)
     */
    async deleteInvoice(id: string): Promise<void> {
        const invoice = await Invoice.findByIdAndDelete(id);
        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }
    }

    /**
     * Get invoice by ID
     * @param id Invoice ID
     * @returns Invoice document
     */
    async getInvoiceById(id: string): Promise<IInvoiceDocument> {
        const invoice = await Invoice.findById(id);
        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }
        return invoice;
    }

    /**
     * Get invoice by Invoice Number
     * @param invoiceNumber Invoice Number
     * @returns Invoice document
     */
    async getInvoiceByNumber(invoiceNumber: string): Promise<IInvoiceDocument> {
        const invoice = await Invoice.findOne({ invoiceNumber });
        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }
        return invoice;
    }

    /**
     * Update invoice status (e.g., mark as PAID)
     * @param id Invoice ID
     * @param status New status
     * @returns Updated invoice
     */
    async updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<IInvoiceDocument> {
        const invoice = await this.getInvoiceById(id);
        const wasPaid = invoice.status === InvoiceStatus.PAID;

        invoice.status = status;
        if (status === InvoiceStatus.PAID) {
            invoice.balanceDue = 0;
            invoice.credit = invoice.total;

            // Handle Order and Service Activation seamlessly with new background Provisioning hook queue processing.
            if (invoice.orderId) {
                await handleInvoicePaid(invoice._id as any);
            }
            // Trigger Unsuspend Evaluation for Renewals
            await serviceLifecycleService.onInvoicePaidUnsuspend(invoice._id as any);
            // Advance due dates
            await serviceLifecycleService.applyRenewalPayment(invoice._id as any);
        } else if (status === InvoiceStatus.UNPAID) {
            invoice.credit = 0;
            invoice.balanceDue = invoice.total;
        }

        await invoice.save();
        await this.setInvoiceFxSnapshot(invoice);

        if (status === InvoiceStatus.PAID) {
            await affiliateService.processPaidInvoice(invoice._id.toString());
        } else if (wasPaid) {
            await affiliateService.reverseCommissionsForInvoice(invoice._id.toString(), `Invoice status changed to ${status}`);
        }

        if (status === InvoiceStatus.PAID) {
            const clientDoc = await Client.findById(invoice.clientId).select('contactEmail firstName lastName').lean();
            const clientEmail = clientDoc?.contactEmail || '';
            if (clientEmail) {
                const customerName = clientDoc ? `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim() || 'Customer' : 'Customer';
                const baseUrl = config.frontendUrl || (config as any).cors?.origin || 'http://localhost:3000';
                let attachments: { filename: string; content: Buffer }[] | undefined;
                try {
                    const pdfBuffer = await getInvoicePdfBuffer(invoice);
                    attachments = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }];
                } catch (pdfErr: any) {
                    logger.warn('[Invoice] Payment success email PDF failed (status update):', pdfErr?.message);
                }
                emailService.sendTemplatedEmail({
                    to: clientEmail,
                    templateKey: 'billing.payment_success',
                    props: {
                        customerName,
                        invoiceNumber: invoice.invoiceNumber,
                        transactionId: 'N/A',
                        amountPaid: String(invoice.total ?? 0),
                        currency: invoice.currency || 'BDT',
                        paymentDate: new Date().toLocaleDateString(),
                        paymentMethodLabel: 'Marked as paid',
                        billingUrl: `${baseUrl}/client`,
                    },
                    attachments,
                }).catch(() => {});
            }
        }

        return invoice;
    }

    /**
     * Update invoice (items, billedTo, dates, credit) - admin only
     */
    async updateInvoice(id: string, updates: Partial<Pick<IInvoice, 'billedTo' | 'invoiceDate' | 'dueDate' | 'items' | 'credit' | 'currency'>>): Promise<IInvoiceDocument> {
        const invoice = await this.getInvoiceById(id);

        if (updates.billedTo) {
            if (updates.billedTo.companyName !== undefined) invoice.billedTo.companyName = updates.billedTo.companyName;
            if (updates.billedTo.customerName !== undefined) invoice.billedTo.customerName = updates.billedTo.customerName;
            if (updates.billedTo.address !== undefined) invoice.billedTo.address = updates.billedTo.address;
            if (updates.billedTo.country !== undefined) invoice.billedTo.country = updates.billedTo.country;
        }
        if (updates.invoiceDate) invoice.invoiceDate = new Date(updates.invoiceDate);
        if (updates.dueDate) invoice.dueDate = new Date(updates.dueDate);
        if (updates.items && Array.isArray(updates.items)) {
            invoice.items = updates.items.map((item: any) => ({
                type: item.type || InvoiceItemType.HOSTING,
                description: item.description || '',
                amount: Number(item.amount) || 0,
                period: item.period?.startDate && item.period?.endDate
                    ? {
                        startDate: new Date(item.period.startDate),
                        endDate: new Date(item.period.endDate),
                    }
                    : undefined,
                meta: item.meta,
            }));
        }
        if (updates.credit !== undefined) invoice.credit = Number(updates.credit) || 0;
        if (updates.currency) invoice.currency = updates.currency;

        await invoice.save();
        await this.setInvoiceFxSnapshot(invoice);
        return invoice;
    }

    /**
     * Send a reminder/notification email for a single invoice (admin only)
     * @param template Optional template type (invoice-payment-reminder, first-overdue-notice, etc.)
     */
    async sendReminder(id: string, template?: string): Promise<{ sent: boolean; message: string }> {
        const invoice = await Invoice.findById(id)
            .populate({ path: 'clientId', select: 'contactEmail user', populate: { path: 'user', select: 'email' } })
            .lean();
        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }
        if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) {
            return { sent: false, message: 'Cannot send reminder for paid or cancelled invoice' };
        }

        const client = invoice.clientId as any;
        const email = client?.contactEmail || client?.user?.email;
        if (!email) {
            return { sent: false, message: 'No email found for client' };
        }

        const invNum = (invoice as any).invoiceNumber || 'Invoice';
        const templateMap: Record<string, { subject: string; template: string }> = {
            'invoice-created': { subject: `Invoice ${invNum} Created`, template: 'invoice-created' },
            'invoice-payment-reminder': { subject: `Invoice ${invNum} Due - Payment Reminder`, template: 'invoice-pre-reminder' },
            'first-overdue-notice': { subject: `Invoice ${invNum} - First Overdue Notice`, template: 'invoice-overdue-1' },
            'second-overdue-notice': { subject: `Invoice ${invNum} - Second Overdue Notice`, template: 'invoice-overdue-2' },
            'third-overdue-notice': { subject: `Invoice ${invNum} - Third Overdue Notice`, template: 'invoice-overdue-3' },
            'invoice-payment-confirmation': { subject: `Payment Received - Invoice ${invNum}`, template: 'invoice-payment-confirmation' },
            'invoice-modified': { subject: `Invoice ${invNum} Modified`, template: 'invoice-modified' },
        };
        const config = templateMap[template || ''] || templateMap['invoice-payment-reminder'];
        const sent = await notificationProvider.sendEmail(email, config.subject, config.template, { invoice });
        return { sent, message: sent ? 'Reminder sent successfully' : 'Failed to send reminder' };
    }

    /**
     * Record a manual payment for an invoice (admin only)
     */
    async addPayment(
        id: string,
        data: {
            date: string;
            amount: number;
            paymentMethod: string;
            transactionFees?: number;
            transactionId?: string;
            sendEmail?: boolean;
        }
    ): Promise<IInvoiceDocument> {
        const invoice = await this.getInvoiceById(id);

        if (invoice.status === InvoiceStatus.PAID) {
            throw new ApiError(400, 'Invoice is already paid');
        }
        if (invoice.status === InvoiceStatus.CANCELLED) {
            throw new ApiError(400, 'Cannot add payment to cancelled invoice');
        }

        const amount = Number(data.amount) || 0;
        if (amount <= 0) {
            throw new ApiError(400, 'Payment amount must be greater than zero');
        }
        if (amount > invoice.balanceDue) {
            throw new ApiError(400, 'Payment amount cannot exceed balance due');
        }

        // Increase credit (applied amount) so balanceDue = total - credit is correct after pre-save
        invoice.credit = (invoice.credit || 0) + amount;
        invoice.paymentMethod = data.paymentMethod || invoice.paymentMethod;

        const fullyPaid = invoice.balanceDue <= amount;
        if (fullyPaid) {
            invoice.status = InvoiceStatus.PAID;
            invoice.credit = invoice.total;
        }

        await invoice.save();
        await this.setInvoiceFxSnapshot(invoice);

        // Record manual payment transaction (with FX snapshot at payment date)
        const paymentDate = data.date ? new Date(data.date) : new Date();
        const { buildPaymentFxSnapshot } = await import('../exchange-rate/fx.service');
        const { snapshot: paymentFx, isLegacy: paymentFxLegacy } = await buildPaymentFxSnapshot(
            amount,
            invoice.currency,
            paymentDate
        );
        await PaymentTransaction.create({
            invoiceId: invoice._id,
            orderId: invoice.orderId,
            clientId: invoice.clientId as any,
            userId: undefined,
            gateway: data.paymentMethod || 'manual',
            type: TransactionType.CHARGE,
            status: TransactionStatus.SUCCESS,
            amount,
            currency: invoice.currency,
            paymentDate,
            fxSnapshot: paymentFx,
            fxSnapshotLegacy: paymentFxLegacy,
            externalTransactionId: data.transactionId,
            gatewayPayload: {
                date: data.date,
                transactionFees: data.transactionFees,
            },
        });

        if (fullyPaid) {
            if (invoice.orderId) {
                await handleInvoicePaid(invoice._id as any);
            }
            await affiliateService.processPaidInvoice(invoice._id.toString());
            await serviceLifecycleService.onInvoicePaidUnsuspend(invoice._id as any);
            await serviceLifecycleService.applyRenewalPayment(invoice._id as any);

            // Notify user about manual payment
            await notificationService.create({
                userId: invoice.clientId as any,
                clientId: invoice.clientId as any,
                category: 'billing',
                title: `Payment recorded for Invoice ${invoice.invoiceNumber}`,
                message: `A payment of ${amount} ${invoice.currency} has been recorded (${data.paymentMethod}).`,
                linkPath: `/invoices/${invoice._id.toString()}`,
                linkLabel: 'View invoice',
                meta: {
                    invoiceId: invoice._id.toString(),
                    transactionId: data.transactionId,
                },
            });

            const clientDoc = await Client.findById(invoice.clientId).select('contactEmail firstName lastName').lean();
            const clientEmail = clientDoc?.contactEmail || '';
            const customerName = clientDoc ? `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim() || 'Customer' : 'Customer';
            const baseUrl = config.frontendUrl || (config as any).cors?.origin || 'http://localhost:3000';
            if (clientEmail) {
                let attachments: { filename: string; content: Buffer }[] | undefined;
                try {
                    const pdfBuffer = await getInvoicePdfBuffer(invoice);
                    attachments = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }];
                } catch (pdfErr: any) {
                    logger.warn('[Invoice] Payment success email PDF failed:', pdfErr?.message);
                }
                emailService.sendTemplatedEmail({
                    to: clientEmail,
                    templateKey: 'billing.payment_success',
                    props: {
                        customerName,
                        invoiceNumber: invoice.invoiceNumber,
                        transactionId: data.transactionId || 'N/A',
                        amountPaid: String(amount),
                        currency: invoice.currency || 'BDT',
                        paymentDate: new Date().toLocaleDateString(),
                        paymentMethodLabel: data.paymentMethod || 'Manual',
                        billingUrl: `${baseUrl}/client`,
                    },
                    attachments,
                }).catch(() => {});
            }
        }

        // Only send via notificationProvider when sendEmail requested AND we did not already send (avoids duplicate when fullyPaid)
        if (data.sendEmail && !fullyPaid) {
            try {
                const inv = await Invoice.findById(id)
                    .populate({ path: 'clientId', select: 'contactEmail user', populate: { path: 'user', select: 'email' } })
                    .lean();
                const client = (inv as any)?.clientId;
                const email = client?.contactEmail || client?.user?.email;
                if (email) {
                    const emailSubject = `Payment Received - Invoice ${invoice.invoiceNumber}`;
                    await notificationProvider.sendEmail(email, emailSubject, 'invoice-payment-confirmation', {
                        invoice: inv,
                        amount: data.amount,
                        transactionId: data.transactionId,
                    });
                }
            } catch {
                // Don't fail the payment if email fails
            }
        }

        return invoice;
    }

    /**
     * Get all invoices with pagination and filters
     */
    async getInvoices(
        filters: any,
        options: { page?: number | string; limit?: number | string; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}
    ) {
        const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });
        const sort = buildSort(sortBy, sortOrder);

        const invoices = await Invoice.find(filters).sort(sort).skip(skip).limit(safeLimit);
        const totalCounts = await Invoice.countDocuments(filters);

        return {
            results: invoices,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.ceil(totalCounts / safeLimit),
            totalResults: totalCounts,
        };
    }

    /**
     * Aggregated sales stats in base (reporting) currency. Uses only stored base amounts (no recalc with current rate).
     * Optional displayCurrency: converts base totals for display only via current rate.
     */
    async getDashboardStats(options?: { displayCurrency?: string }): Promise<{
        baseCurrency: string;
        totalRevenueInBase: number;
        unpaidInBase: number;
        paidCount: number;
        unpaidCount: number;
        hasLegacyData: boolean;
        displayCurrency?: string;
        displayFxRate?: number;
        displayTotals?: { totalRevenue: number; unpaid: number };
    }> {
        const paid = await Invoice.find({ status: InvoiceStatus.PAID })
            .select('total totalInBase currency balanceDue balanceDueInBase fxSnapshot fxSnapshotLegacy')
            .lean();
        const unpaid = await Invoice.find({ status: { $in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] } })
            .select('balanceDue balanceDueInBase currency fxSnapshot fxSnapshotLegacy')
            .lean();

        let hasLegacyData = false;
        const totalRevenueInBase = paid.reduce((sum, doc) => {
            const inBase = doc.totalInBase ?? doc.fxSnapshot?.totalInBase;
            if (inBase != null) return sum + inBase;
            hasLegacyData = true;
            return sum + fallbackToBase(doc.total ?? 0, doc.currency ?? '');
        }, 0);
        const unpaidInBase = unpaid.reduce((sum, doc) => {
            const inBase = doc.balanceDueInBase ?? doc.fxSnapshot?.balanceDueInBase;
            if (inBase != null) return sum + inBase;
            hasLegacyData = true;
            return sum + fallbackToBase(doc.balanceDue ?? 0, doc.currency ?? '');
        }, 0);

        const round2 = (n: number) => Math.round(n * 100) / 100;
        const result: {
            baseCurrency: string;
            totalRevenueInBase: number;
            unpaidInBase: number;
            paidCount: number;
            unpaidCount: number;
            hasLegacyData: boolean;
            displayCurrency?: string;
            displayFxRate?: number;
            displayTotals?: { totalRevenue: number; unpaid: number };
        } = {
            baseCurrency: BASE_REPORTING_CURRENCY,
            totalRevenueInBase: round2(totalRevenueInBase),
            unpaidInBase: round2(unpaidInBase),
            paidCount: paid.length,
            unpaidCount: unpaid.length,
            hasLegacyData,
        };

        const displayCurrency = options?.displayCurrency?.trim();
        if (displayCurrency && displayCurrency !== BASE_REPORTING_CURRENCY) {
            const rate = getRateFromBaseToDisplay(displayCurrency);
            result.displayCurrency = displayCurrency;
            result.displayFxRate = rate;
            result.displayTotals = {
                totalRevenue: round2(totalRevenueInBase * rate),
                unpaid: round2(unpaidInBase * rate),
            };
        }

        return result;
    }
}

export default new InvoiceService();

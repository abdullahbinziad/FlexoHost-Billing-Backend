import Invoice from './invoice.model';
import { IInvoice, IInvoiceDocument, InvoiceStatus, InvoiceItemType } from './invoice.interface';
import ApiError from '../../utils/apiError';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import { handleInvoicePaid } from '../services/services';
import serviceLifecycleService from '../services/services/service-lifecycle.service';
import { notificationProvider } from '../services/providers/notification.provider';

class InvoiceService {
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
    async createInvoice(invoiceData: Partial<IInvoice>): Promise<IInvoiceDocument> {
        // Calculate totals first to ensure validation passes or simple overwrite
        const subTotal = invoiceData.items?.reduce((acc, item) => acc + item.amount, 0) || 0;
        const discount = invoiceData.discount ?? 0;
        const total = Math.max(0, subTotal - discount);
        const credit = invoiceData.credit || 0;
        const balanceDue = total - credit;

        const invoiceNumber = await this.generateInvoiceNumber();

        const invoice = await Invoice.create({
            ...invoiceData,
            invoiceNumber,
            status: InvoiceStatus.UNPAID,
            subTotal,
            discount,
            total,
            balanceDue,
        });

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

        if (invoice.balanceDue <= amount) {
            invoice.status = InvoiceStatus.PAID;
            invoice.credit = invoice.total;
            if (invoice.orderId) {
                await handleInvoicePaid(invoice._id as any);
            }
            await serviceLifecycleService.onInvoicePaidUnsuspend(invoice._id as any);
            await serviceLifecycleService.applyRenewalPayment(invoice._id as any);
        }

        await invoice.save();

        if (data.sendEmail) {
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
    async getInvoices(filters: any, options: { page: number; limit: number; sortBy?: string; sortOrder?: string }) {
        const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const skip = (page - 1) * limit;

        const sort: any = {};
        if (sortBy) {
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        }

        const invoices = await Invoice.find(filters).sort(sort).skip(skip).limit(limit);
        const totalCounts = await Invoice.countDocuments(filters);

        return {
            results: invoices,
            page,
            limit,
            totalPages: Math.ceil(totalCounts / limit),
            totalResults: totalCounts,
        };
    }
}

export default new InvoiceService();

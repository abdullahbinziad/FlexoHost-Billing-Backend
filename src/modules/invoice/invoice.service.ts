import Invoice from './invoice.model';
import { IInvoice, IInvoiceDocument, InvoiceStatus } from './invoice.interface';
import ApiError from '../../utils/apiError';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import { handleInvoicePaid } from '../services/services';
import serviceLifecycleService from '../services/services/service-lifecycle.service';

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
        const total = subTotal;
        const credit = invoiceData.credit || 0;
        const balanceDue = total - credit;

        const invoiceNumber = await this.generateInvoiceNumber();

        const invoice = await Invoice.create({
            ...invoiceData,
            invoiceNumber,
            status: InvoiceStatus.UNPAID,
            subTotal,
            total,
            balanceDue,
        });

        return invoice;
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
        }

        await invoice.save();
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

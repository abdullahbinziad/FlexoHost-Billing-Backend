import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import invoiceService from './invoice.service';
import { InvoiceStatus } from './invoice.interface';

class InvoiceController {
    createInvoice = catchAsync(async (req: Request, res: Response) => {
        const invoice = await invoiceService.createInvoice(req.body);
        return ApiResponse.created(res, 'Invoice created successfully', invoice);
    });

    getInvoice = catchAsync(async (req: Request, res: Response) => {
        // Can search by ID or Invoice Number
        const { id } = req.params;
        let invoice;

        // Simple check if it looks like a mongo ID
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            invoice = await invoiceService.getInvoiceById(id);
        } else {
            invoice = await invoiceService.getInvoiceByNumber(id);
        }

        return ApiResponse.ok(res, 'Invoice retrieved', invoice);
    });

    getAllInvoices = catchAsync(async (req: Request, res: Response) => {
        const filters: any = {};
        const options = {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 10,
            sortBy: (req.query.sortBy as string) || 'createdAt',
            sortOrder: (req.query.sortOrder as string) || 'desc',
        };

        if (req.query.status) {
            filters.status = req.query.status;
        }

        if (req.query.invoiceNumber) {
            filters.invoiceNumber = { $regex: req.query.invoiceNumber, $options: 'i' };
        }

        // Auto-scope for client-role users: only show their own invoices
        const user = (req as any).user;
        if (user && (user.role === 'client' || user.role === 'user')) {
            const Client = (await import('../client/client.model')).default;
            const client = await Client.findOne({ user: user.id || user._id }).lean();
            if (client) {
                filters.clientId = client._id;
            } else {
                // No client record found — return empty results
                return ApiResponse.ok(res, 'Invoices retrieved', {
                    results: [],
                    page: options.page,
                    limit: options.limit,
                    totalPages: 0,
                    totalResults: 0,
                });
            }
        } else if (req.query.clientId) {
            // Admin/staff can filter by specific clientId
            filters.clientId = req.query.clientId;
        }

        const result = await invoiceService.getInvoices(filters, options);
        return ApiResponse.ok(res, 'Invoices retrieved', result);
    });

    updateStatus = catchAsync(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!Object.values(InvoiceStatus).includes(status)) {
            throw new Error('Invalid status');
        }

        const invoice = await invoiceService.updateInvoiceStatus(id, status);
        return ApiResponse.ok(res, `Invoice marked as ${status}`, invoice);
    });

    sendReminder = catchAsync(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { template } = req.body;
        const result = await invoiceService.sendReminder(id, template);
        return ApiResponse.ok(res, result.message, result);
    });

    deleteInvoice = catchAsync(async (req: Request, res: Response) => {
        const { id } = req.params;
        await invoiceService.deleteInvoice(id);
        return ApiResponse.ok(res, 'Invoice deleted successfully');
    });

    addPayment = catchAsync(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { date, amount, paymentMethod, transactionFees, transactionId, sendEmail } = req.body;
        const invoice = await invoiceService.addPayment(id, {
            date,
            amount,
            paymentMethod,
            transactionFees,
            transactionId,
            sendEmail,
        });
        return ApiResponse.ok(res, 'Payment recorded successfully', invoice);
    });

    updateInvoice = catchAsync(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { billedTo, invoiceDate, dueDate, items, credit, currency } = req.body;
        const updates: any = {};
        if (billedTo) updates.billedTo = billedTo;
        if (invoiceDate) updates.invoiceDate = invoiceDate;
        if (dueDate) updates.dueDate = dueDate;
        if (items) updates.items = items;
        if (credit !== undefined) updates.credit = credit;
        if (currency) updates.currency = currency;

        const invoice = await invoiceService.updateInvoice(id, updates);
        return ApiResponse.ok(res, 'Invoice updated successfully', invoice);
    });
}

export default new InvoiceController();

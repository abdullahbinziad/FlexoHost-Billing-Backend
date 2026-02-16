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

        // Add more filters as needed (customer name, date range etc)

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
}

export default new InvoiceController();

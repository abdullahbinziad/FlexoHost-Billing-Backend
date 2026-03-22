import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import ApiError from '../../utils/apiError';
import invoiceService from './invoice.service';
import { InvoiceStatus } from './invoice.interface';
import { getInvoicePdfBuffer } from './pdf/invoice-pdf.service';
import { auditLogSafe } from '../activity-log/activity-log.service';
import type { AuthRequest } from '../../middlewares/auth';
import { getEffectiveClientId } from '../client-access-grant/effective-client';

function getIp(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
}
function getUserAgent(req: Request): string {
    return (req.headers['user-agent'] as string) || '';
}

const ALLOWED_INVOICE_CREATE_FIELDS = [
    'clientId', 'billedTo', 'items', 'currency', 'invoiceDate', 'dueDate',
    'discount', 'credit', 'orderId',
];

class InvoiceController {
    createInvoice = catchAsync(async (req: Request, res: Response) => {
        const body = req.body as Record<string, unknown>;
        const invoiceData = Object.fromEntries(
            Object.entries(body).filter(([k]) => ALLOWED_INVOICE_CREATE_FIELDS.includes(k))
        );
        const invoice = await invoiceService.createInvoice(invoiceData as any);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Invoice ${invoice.invoiceNumber} created`,
            type: 'invoice_created',
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?.id || authReq.user?._id,
            targetType: 'invoice',
            targetId: invoice._id.toString(),
            source: 'manual',
            clientId: (invoice.clientId as any)?.toString(),
            invoiceId: invoice._id.toString(),
            ipAddress: getIp(req),
            userAgent: getUserAgent(req),
        });
        return ApiResponse.created(res, 'Invoice created successfully', invoice);
    });

    getInvoice = catchAsync(async (req: Request, res: Response) => {
        const { id } = req.params;
        let invoice;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            invoice = await invoiceService.getInvoiceById(id);
        } else {
            invoice = await invoiceService.getInvoiceByNumber(id);
        }
        const user = (req as any).user;
        if (user && (user.role === 'client' || user.role === 'user')) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'invoices');
            if (effectiveClientId === null) return;
            if ((invoice.clientId as any)?.toString() !== effectiveClientId) {
                throw new ApiError(403, 'You do not have access to this invoice');
            }
        }
        return ApiResponse.ok(res, 'Invoice retrieved', invoice);
    });

    /** Download invoice as PDF (same layout as portal and email attachment) */
    getInvoicePdf = catchAsync(async (req: Request, res: Response) => {
        const { id } = req.params;
        const invoice = await invoiceService.getInvoiceById(id);
        const user = (req as any).user;
        if (user && (user.role === 'client' || user.role === 'user')) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'invoices');
            if (effectiveClientId === null) return;
            if ((invoice.clientId as any)?.toString() !== effectiveClientId) {
                throw new ApiError(403, 'You do not have access to this invoice');
            }
        }
        const pdfBuffer = await getInvoicePdfBuffer(invoice);
        const filename = `Invoice-${invoice.invoiceNumber}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    });

    getAllInvoices = catchAsync(async (req: Request, res: Response) => {
        const filters: any = {};
        const options = {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 10,
            sortBy: (req.query.sortBy as string) || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
        };

        if (req.query.status) {
            filters.status = req.query.status;
        }

        if (req.query.invoiceNumber) {
            filters.invoiceNumber = String(req.query.invoiceNumber).trim();
        }

        const user = (req as any).user;
        if (user && (user.role === 'client' || user.role === 'user')) {
            const effectiveClientId = await getEffectiveClientId(req, res, 'invoices');
            if (effectiveClientId === null) return;
            filters.clientId = effectiveClientId;
        } else if (req.query.clientId) {
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
        const authReq = req as AuthRequest;
        const eventType = status === InvoiceStatus.PAID ? 'invoice_paid' : status === InvoiceStatus.CANCELLED ? 'invoice_cancelled' : 'invoice_updated';
        auditLogSafe({
            message: `Invoice ${invoice.invoiceNumber} marked as ${status}`,
            type: eventType as any,
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?.id || authReq.user?._id,
            targetType: 'invoice',
            targetId: invoice._id.toString(),
            source: 'manual',
            clientId: (invoice.clientId as any)?.toString(),
            invoiceId: invoice._id.toString(),
            ipAddress: getIp(req),
            userAgent: getUserAgent(req),
        });
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
        const invoice = await invoiceService.getInvoiceById(id);
        await invoiceService.deleteInvoice(id);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Invoice ${invoice.invoiceNumber} deleted`,
            type: 'invoice_deleted',
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?.id || authReq.user?._id,
            targetType: 'invoice',
            targetId: id,
            source: 'manual',
            clientId: (invoice.clientId as any)?.toString(),
            invoiceId: id,
            ipAddress: getIp(req),
            userAgent: getUserAgent(req),
            severity: 'high',
        });
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
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Payment recorded for Invoice ${invoice.invoiceNumber}: ${amount} ${invoice.currency}`,
            type: 'payment_received',
            category: 'payment',
            actorType: 'user',
            actorId: authReq.user?.id || authReq.user?._id,
            targetType: 'invoice',
            targetId: id,
            source: 'manual',
            clientId: (invoice.clientId as any)?.toString(),
            invoiceId: id,
            ipAddress: getIp(req),
            userAgent: getUserAgent(req),
            meta: { amount, paymentMethod, transactionId: transactionId ? '[REDACTED]' : undefined },
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
        const authReq = req as AuthRequest;
        const creditChanged = updates.credit !== undefined;
        auditLogSafe({
            message: creditChanged ? `Invoice ${invoice.invoiceNumber} credit updated` : `Invoice ${invoice.invoiceNumber} updated`,
            type: creditChanged ? 'credit_changed' : 'invoice_updated',
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?.id || authReq.user?._id,
            targetType: 'invoice',
            targetId: id,
            source: 'manual',
            clientId: (invoice.clientId as any)?.toString(),
            invoiceId: id,
            ipAddress: getIp(req),
            userAgent: getUserAgent(req),
        });
        return ApiResponse.ok(res, 'Invoice updated successfully', invoice);
    });

    /** Aggregated sales in base currency; optional ?displayCurrency= for display conversion */
    getDashboardStats = catchAsync(async (req: Request, res: Response) => {
        const displayCurrency = (req.query.displayCurrency as string) || undefined;
        const stats = await invoiceService.getDashboardStats({ displayCurrency });
        return ApiResponse.ok(res, 'Dashboard stats retrieved', stats);
    });
}

export default new InvoiceController();

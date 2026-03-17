import { Request, Response } from 'express';
import { billableItemService } from './billable-item.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { auditLogSafe } from '../activity-log/activity-log.service';
import type { AuthRequest } from '../../middlewares/auth';

export class BillableItemController {
    create = catchAsync(async (req: Request, res: Response) => {
        const body = req.body;
        const item = await billableItemService.create({
            clientId: body.clientId,
            productId: body.productId,
            description: body.description,
            unitType: body.unitType || 'hours',
            hoursOrQty: parseFloat(body.hoursOrQty) || 0,
            amount: parseFloat(body.amount) || 0,
            invoiceAction: body.invoiceAction || 'DONT_INVOICE',
            dueDate: body.dueDate ? new Date(body.dueDate) : new Date(),
            recurEvery: body.recurEvery ? parseInt(body.recurEvery, 10) : undefined,
            recurUnit: body.recurUnit,
            recurCount: body.recurCount ? parseInt(body.recurCount, 10) : undefined,
            currency: body.currency || 'USD',
        });
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Billable item created for client ${body.clientId}`,
            type: 'settings_changed',
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'billable_item',
            targetId: (item as any)._id?.toString?.(),
            clientId: body.clientId,
            meta: { action: 'created' } as Record<string, unknown>,
        });
        return ApiResponse.created(res, 'Billable item created', item);
    });

    list = catchAsync(async (req: Request, res: Response) => {
        const { page, limit, search, clientId, invoiced, invoiceAction, recurring } = req.query;
        const result = await billableItemService.list({
            page: page ? parseInt(String(page), 10) : undefined,
            limit: limit ? parseInt(String(limit), 10) : undefined,
            search: search ? String(search) : undefined,
            clientId: clientId ? String(clientId) : undefined,
            invoiced: invoiced === 'true' ? true : invoiced === 'false' ? false : undefined,
            invoiceAction: invoiceAction ? String(invoiceAction) : undefined,
            recurring: recurring === 'true',
        });
        return ApiResponse.success(res, 200, 'Billable items retrieved', result);
    });

    getById = catchAsync(async (req: Request, res: Response) => {
        const item = await billableItemService.getById(req.params.id);
        return ApiResponse.success(res, 200, 'Billable item retrieved', item);
    });

    update = catchAsync(async (req: Request, res: Response) => {
        const body = req.body;
        const item = await billableItemService.update(req.params.id, {
            description: body.description,
            unitType: body.unitType,
            hoursOrQty: body.hoursOrQty != null ? parseFloat(body.hoursOrQty) : undefined,
            amount: body.amount != null ? parseFloat(body.amount) : undefined,
            invoiceAction: body.invoiceAction,
            dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
            recurEvery: body.recurEvery != null ? parseInt(body.recurEvery, 10) : undefined,
            recurUnit: body.recurUnit,
            recurCount: body.recurCount != null ? parseInt(body.recurCount, 10) : undefined,
            currency: body.currency,
        });
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Billable item updated: ${req.params.id}`,
            type: 'settings_changed',
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'billable_item',
            targetId: req.params.id,
            meta: { action: 'updated' } as Record<string, unknown>,
        });
        return ApiResponse.success(res, 200, 'Billable item updated', item);
    });

    delete = catchAsync(async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        await billableItemService.delete(req.params.id);
        auditLogSafe({
            message: `Billable item deleted: ${req.params.id}`,
            type: 'settings_changed',
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'billable_item',
            targetId: req.params.id,
            meta: { action: 'deleted' } as Record<string, unknown>,
        });
        return ApiResponse.success(res, 200, 'Billable item deleted');
    });

    bulkInvoiceOnCron = catchAsync(async (req: Request, res: Response) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return ApiResponse.badRequest(res, 'ids array is required');
        }
        await billableItemService.bulkUpdateInvoiceAction(ids, 'INVOICE_ON_CRON');
        return ApiResponse.success(res, 200, 'Items updated for next cron run');
    });

    bulkDelete = catchAsync(async (req: Request, res: Response) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return ApiResponse.badRequest(res, 'ids array is required');
        }
        await billableItemService.bulkDelete(ids);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Billable items bulk deleted: ${ids.length} items`,
            type: 'settings_changed',
            category: 'invoice',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            meta: { action: 'bulk_deleted', count: ids.length } as Record<string, unknown>,
        });
        return ApiResponse.success(res, 200, 'Items deleted');
    });
}

export default new BillableItemController();

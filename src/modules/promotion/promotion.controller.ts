import { Request, Response } from 'express';
import { promotionService } from './promotion.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { auditLogSafe } from '../activity-log/activity-log.service';
import type { AuthRequest } from '../../middlewares/auth';

class PromotionController {
    create = catchAsync(async (req: Request, res: Response) => {
        const promotion = await promotionService.create(req.body);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Promotion created: ${(promotion as any).code ?? (promotion as any)._id}`,
            type: 'settings_changed',
            category: 'settings',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'promotion',
            targetId: (promotion as any)._id?.toString?.(),
            meta: { action: 'created' } as Record<string, unknown>,
        });
        return ApiResponse.created(res, 'Promotion created successfully', promotion);
    });

    getAll = catchAsync(async (req: Request, res: Response) => {
        const { isActive, page, limit, search } = req.query;
        const result = await promotionService.getAll({
            isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            search: search as string,
        });
        return ApiResponse.success(res, 200, 'Promotions retrieved successfully', result);
    });

    getOne = catchAsync(async (req: Request, res: Response) => {
        const promotion = await promotionService.getById(req.params.id);
        return ApiResponse.success(res, 200, 'Promotion details retrieved', promotion);
    });

    update = catchAsync(async (req: Request, res: Response) => {
        const promotion = await promotionService.update(req.params.id, req.body);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Promotion updated: ${(promotion as any).code ?? req.params.id}`,
            type: 'settings_changed',
            category: 'settings',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'promotion',
            targetId: (promotion as any)._id?.toString?.(),
            meta: { action: 'updated' } as Record<string, unknown>,
        });
        return ApiResponse.success(res, 200, 'Promotion updated successfully', promotion);
    });

    delete = catchAsync(async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        await promotionService.delete(req.params.id);
        auditLogSafe({
            message: `Promotion deleted: ${req.params.id}`,
            type: 'settings_changed',
            category: 'settings',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'promotion',
            targetId: req.params.id,
            meta: { action: 'deleted' } as Record<string, unknown>,
        });
        return ApiResponse.success(res, 200, 'Promotion deleted successfully', null);
    });

    toggleActive = catchAsync(async (req: Request, res: Response) => {
        const { isActive } = req.body;
        const promotion = await promotionService.toggleActive(req.params.id, isActive);
        const authReq = req as AuthRequest;
        auditLogSafe({
            message: `Promotion ${isActive ? 'activated' : 'deactivated'}: ${(promotion as any).code ?? req.params.id}`,
            type: 'settings_changed',
            category: 'settings',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            targetType: 'promotion',
            targetId: (promotion as any)._id?.toString?.(),
            meta: { action: 'toggle_active', isActive } as Record<string, unknown>,
        });
        return ApiResponse.success(res, 200, 'Promotion status updated', {
            id: promotion?._id,
            isActive: promotion?.isActive,
        });
    });

    getUsageStats = catchAsync(async (req: Request, res: Response) => {
        const stats = await promotionService.getUsageStats(req.params.id);
        return ApiResponse.success(res, 200, 'Usage stats retrieved', stats);
    });

    /** Public endpoint for checkout - validate coupon without applying */
    validateCoupon = catchAsync(async (req: Request, res: Response) => {
        const { code, subtotal, currency, clientId, productIds, productTypes, productBillingCycle, domainTlds, domainBillingCycle, isFirstOrder } = req.body;
        const result = await promotionService.validateCoupon({
            code,
            subtotal: Number(subtotal),
            currency: currency || 'BDT',
            clientId,
            productIds: productIds || [],
            productTypes: productTypes || [],
            productBillingCycle,
            domainTlds: domainTlds || [],
            domainBillingCycle,
            isFirstOrder: isFirstOrder ?? false,
        });
        if (!result.valid) {
            return ApiResponse.error(res, 400, result.error || 'Invalid coupon');
        }
        return ApiResponse.success(res, 200, 'Coupon applied', {
            valid: true,
            promotionId: result.promotion?._id,
            code: result.code || result.promotion?.code,
            discountAmount: result.discountAmount,
            name: result.name || result.promotion?.name,
            source: result.source,
        });
    });
}

export const promotionController = new PromotionController();

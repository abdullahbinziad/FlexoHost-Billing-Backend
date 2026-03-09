import { Request, Response } from 'express';
import { promotionService } from './promotion.service';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';

class PromotionController {
    create = catchAsync(async (req: Request, res: Response) => {
        const promotion = await promotionService.create(req.body);
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
        return ApiResponse.success(res, 200, 'Promotion updated successfully', promotion);
    });

    delete = catchAsync(async (req: Request, res: Response) => {
        await promotionService.delete(req.params.id);
        return ApiResponse.success(res, 200, 'Promotion deleted successfully', null);
    });

    toggleActive = catchAsync(async (req: Request, res: Response) => {
        const { isActive } = req.body;
        const promotion = await promotionService.toggleActive(req.params.id, isActive);
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
            code: result.promotion?.code,
            discountAmount: result.discountAmount,
            name: result.promotion?.name,
        });
    });
}

export const promotionController = new PromotionController();

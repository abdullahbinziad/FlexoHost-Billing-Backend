import mongoose from 'mongoose';
import Promotion from './promotion.model';
import PromotionUsage from './promotion-usage.model';
import type { IPromotion, IPromotionDocument, ValidateCouponResult } from './promotion.interface';
import ApiError from '../../utils/apiError';
import { escapeRegex } from '../../utils/escapeRegex';
import { affiliateService } from '../affiliate/affiliate.service';

export interface CreatePromotionPayload extends Omit<IPromotion, 'usageCount'> {
    usageCount?: number;
}

export interface ValidateCouponPayload {
    code: string;
    subtotal: number;
    currency: string;
    clientId?: string;
    productIds?: string[];
    productTypes?: string[];
    productBillingCycle?: string;
    domainTlds?: string[];
    domainBillingCycle?: string;
    isFirstOrder?: boolean;
}

class PromotionService {
    async create(data: Partial<CreatePromotionPayload>): Promise<IPromotionDocument> {
        const code = (data.code || '').toUpperCase().trim();
        const isTaken = await (Promotion as any).isCodeTaken(code);
        if (isTaken) {
            throw new ApiError(409, 'A promotion with this code already exists');
        }
        const promotion = await Promotion.create({ ...data, code });
        return promotion;
    }

    async getAll(filter: {
        isActive?: boolean;
        page?: number;
        limit?: number;
        search?: string;
    } = {}) {
        const { isActive, page = 1, limit = 20, search } = filter;
        const query: any = {};
        if (isActive !== undefined) query.isActive = isActive;
        if (search && search.trim()) {
            const escaped = escapeRegex(search.trim());
            query.$or = [
                { code: { $regex: escaped, $options: 'i' } },
                { name: { $regex: escaped, $options: 'i' } },
            ];
        }

        const promotions = await Promotion.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit))
            .lean();

        const total = await Promotion.countDocuments(query);

        return {
            promotions,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(total / Number(limit)),
                totalItems: total,
                itemsPerPage: Number(limit),
            },
        };
    }

    async getById(id: string): Promise<IPromotionDocument | null> {
        if (!mongoose.isValidObjectId(id)) {
            throw new ApiError(400, 'Invalid promotion ID');
        }
        const promotion = await Promotion.findById(id);
        if (!promotion) {
            throw new ApiError(404, 'Promotion not found');
        }
        return promotion;
    }

    async getByCode(code: string): Promise<IPromotionDocument | null> {
        const promotion = await Promotion.findOne({
            code: code.toUpperCase().trim(),
            isActive: true,
        });
        return promotion;
    }

    async update(id: string, data: Partial<IPromotion>): Promise<IPromotionDocument | null> {
        const promotion = await Promotion.findById(id);
        if (!promotion) {
            throw new ApiError(404, 'Promotion not found');
        }
        if (data.code && data.code.toUpperCase().trim() !== promotion.code) {
            const isTaken = await (Promotion as any).isCodeTaken(data.code, id);
            if (isTaken) {
                throw new ApiError(409, 'A promotion with this code already exists');
            }
        }
        Object.assign(promotion, data);
        if (data.code) promotion.code = data.code.toUpperCase().trim();
        await promotion.save();
        return promotion;
    }

    async delete(id: string): Promise<void> {
        const promotion = await Promotion.findByIdAndDelete(id);
        if (!promotion) {
            throw new ApiError(404, 'Promotion not found');
        }
    }

    async toggleActive(id: string, isActive: boolean): Promise<IPromotionDocument | null> {
        const promotion = await Promotion.findByIdAndUpdate(id, { isActive }, { new: true });
        if (!promotion) {
            throw new ApiError(404, 'Promotion not found');
        }
        return promotion;
    }

    /**
     * Validate coupon and compute discount amount
     */
    async validateCoupon(payload: ValidateCouponPayload): Promise<ValidateCouponResult> {
        const {
            code,
            subtotal,
            clientId,
            productIds = [],
            productTypes = [],
            productBillingCycle,
            domainTlds: orderDomainTlds = [],
            domainBillingCycle,
            isFirstOrder = false,
        } = payload;

        const promotion = await Promotion.findOne({
            code: code.toUpperCase().trim(),
            isActive: true,
        });

        if (!promotion) {
            const affiliateResult = await affiliateService.validateReferralCodeDiscount({
                code,
                subtotal,
                clientId,
            });
            if (!affiliateResult.valid) {
                return { valid: false, error: affiliateResult.error || 'Invalid or expired coupon code' };
            }
            return {
                valid: true,
                discountAmount: affiliateResult.discountAmount,
                code: affiliateResult.code,
                name: affiliateResult.name,
                source: 'affiliate',
                affiliateProfile: affiliateResult.affiliateProfile
                    ? {
                        _id: affiliateResult.affiliateProfile._id,
                        clientId: affiliateResult.affiliateProfile.clientId,
                        referralCode: affiliateResult.affiliateProfile.referralCode,
                        referralDiscountRate: affiliateResult.affiliateProfile.referralDiscountRate,
                    }
                    : undefined,
            };
        }

        const now = new Date();
        if (promotion.startDate > now) {
            return { valid: false, error: 'This coupon is not yet active' };
        }
        if (promotion.endDate < now) {
            return { valid: false, error: 'This coupon has expired' };
        }

        if (promotion.usageLimit > 0 && promotion.usageCount >= promotion.usageLimit) {
            return { valid: false, error: 'This coupon has reached its usage limit' };
        }

        if (promotion.minOrderAmount && subtotal < promotion.minOrderAmount) {
            return {
                valid: false,
                error: `Minimum order amount of ${promotion.currency || 'BDT'} ${promotion.minOrderAmount} required`,
            };
        }

        if (promotion.firstOrderOnly && !isFirstOrder) {
            return { valid: false, error: 'This coupon is valid for first orders only' };
        }

        if (clientId && promotion.usagePerClient > 0) {
            const clientUsageCount = await PromotionUsage.countDocuments({
                promotionId: promotion._id,
                clientId: new mongoose.Types.ObjectId(clientId),
            });
            if (clientUsageCount >= promotion.usagePerClient) {
                return { valid: false, error: 'You have already used this coupon the maximum number of times' };
            }
        }

        // Product restrictions: empty = apply to all; otherwise order must match
        if (promotion.productIds?.length) {
            if (!productIds.length) {
                return { valid: false, error: 'This coupon is valid only for specific products' };
            }
            const promoIds = promotion.productIds.map((id) => id.toString());
            const hasMatch = productIds.some((id) => promoIds.includes(id));
            if (!hasMatch) {
                return { valid: false, error: 'This coupon is not valid for the selected products' };
            }
        }

        if (promotion.productTypes?.length) {
            if (!productTypes.length) {
                return { valid: false, error: 'This coupon is valid only for specific product types' };
            }
            const hasMatch = productTypes.some((t) =>
                promotion.productTypes!.some((pt) => pt.toLowerCase() === t.toLowerCase())
            );
            if (!hasMatch) {
                return { valid: false, error: 'This coupon is not valid for the selected product types' };
            }
        }

        // Product billing cycle restriction: empty = apply to all; otherwise order billing cycle must match
        if (promotion.productBillingCycles?.length && productBillingCycle) {
            const promoCycles = promotion.productBillingCycles.map((c) => c.toLowerCase());
            if (!promoCycles.includes(productBillingCycle.toLowerCase())) {
                return { valid: false, error: 'This coupon is not valid for the selected billing cycle' };
            }
        }

        // Domain TLD restriction: empty = apply to all; otherwise order domain TLD must match
        if (promotion.domainTlds?.length) {
            if (!orderDomainTlds.length) {
                return { valid: false, error: 'This coupon is valid only for domain orders with specific TLDs' };
            }
            const promoTlds = promotion.domainTlds.map((t) => (t.startsWith('.') ? t.toLowerCase() : `.${t.toLowerCase()}`));
            const orderTldsNorm = orderDomainTlds.map((t) => (t.startsWith('.') ? t.toLowerCase() : `.${t.toLowerCase()}`));
            const hasMatch = orderTldsNorm.some((t) => promoTlds.includes(t));
            if (!hasMatch) {
                return { valid: false, error: 'This coupon is not valid for the selected domain TLD' };
            }
        }

        // Domain billing cycle restriction: empty = apply to all; otherwise order domain billing cycle must match
        if (promotion.domainBillingCycles?.length && domainBillingCycle) {
            const promoCycles = promotion.domainBillingCycles.map((c) => c.toLowerCase());
            if (!promoCycles.includes(domainBillingCycle.toLowerCase())) {
                return { valid: false, error: 'This coupon is not valid for the selected domain billing cycle' };
            }
        }

        let discountAmount = 0;
        if (promotion.type === 'percent') {
            discountAmount = (subtotal * promotion.value) / 100;
            if (promotion.maxDiscountAmount && discountAmount > promotion.maxDiscountAmount) {
                discountAmount = promotion.maxDiscountAmount;
            }
        } else {
            discountAmount = Math.min(promotion.value, subtotal);
        }

        if (discountAmount <= 0) {
            return { valid: false, error: 'No discount applicable for this order' };
        }

        return {
            valid: true,
            promotion,
            discountAmount: Math.round(discountAmount * 100) / 100,
            code: promotion.code,
            name: promotion.name,
            source: 'promotion',
        };
    }

    /**
     * Record coupon usage after order is created
     * @param session Optional mongoose session for transaction support
     */
    async recordUsage(
        promotionId: string,
        clientId: string,
        orderId: string,
        discountAmount: number,
        session?: mongoose.ClientSession
    ): Promise<void> {
        const opts = session ? { session } : {};
        await PromotionUsage.create(
            [
                {
                    promotionId: new mongoose.Types.ObjectId(promotionId),
                    clientId: new mongoose.Types.ObjectId(clientId),
                    orderId: new mongoose.Types.ObjectId(orderId),
                    discountAmount,
                },
            ],
            opts
        );
        await Promotion.findByIdAndUpdate(promotionId, { $inc: { usageCount: 1 } }, opts);
    }

    async getUsageStats(promotionId: string) {
        const usage = await PromotionUsage.find({ promotionId })
            .populate('clientId', 'firstName lastName contactEmail')
            .populate('orderId', 'orderNumber total')
            .sort({ usedAt: -1 })
            .limit(50)
            .lean();

        const totalDiscount = await PromotionUsage.aggregate([
            { $match: { promotionId: new mongoose.Types.ObjectId(promotionId) } },
            { $group: { _id: null, total: { $sum: '$discountAmount' }, count: { $sum: 1 } } },
        ]);

        return {
            usage,
            totalDiscount: totalDiscount[0]?.total || 0,
            totalUsageCount: totalDiscount[0]?.count || 0,
        };
    }
}

export const promotionService = new PromotionService();

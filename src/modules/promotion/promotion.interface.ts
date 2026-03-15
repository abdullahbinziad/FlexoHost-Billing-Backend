import { Document, Model, Types } from 'mongoose';

/** Discount type: percentage or fixed amount */
export type DiscountType = 'percent' | 'fixed';

/** Promotion status */
export type PromotionStatus = 'active' | 'inactive' | 'expired';

export interface IPromotion {
    code: string;
    name: string;
    description?: string;
    type: DiscountType;
    value: number;
    currency?: string;
    minOrderAmount?: number;
    maxDiscountAmount?: number;
    startDate: Date;
    endDate: Date;
    usageLimit: number;
    usagePerClient: number;
    firstOrderOnly: boolean;
    productIds?: Types.ObjectId[];
    productTypes?: string[];
    productBillingCycles?: string[];
    domainTlds?: string[];
    domainBillingCycles?: string[];
    isActive: boolean;
    usageCount: number;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IPromotionDocument extends IPromotion, Document {
    createdAt: Date;
    updatedAt: Date;
}

export interface IPromotionModel extends Model<IPromotionDocument> {
    isCodeTaken(code: string, excludeId?: string): Promise<boolean>;
}

export interface IPromotionUsage {
    promotionId: Types.ObjectId;
    clientId: Types.ObjectId;
    orderId: Types.ObjectId;
    discountAmount: number;
    usedAt: Date;
}

export interface IPromotionUsageDocument extends IPromotionUsage, Document {}

export interface ValidateCouponResult {
    valid: boolean;
    promotion?: IPromotionDocument;
    discountAmount?: number;
    error?: string;
    code?: string;
    name?: string;
    source?: 'promotion' | 'affiliate';
    affiliateProfile?: {
        _id: Types.ObjectId;
        clientId: Types.ObjectId;
        referralCode: string;
        referralDiscountRate: number;
    };
}

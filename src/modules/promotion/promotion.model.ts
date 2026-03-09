import mongoose, { Schema } from 'mongoose';
import { IPromotionDocument, IPromotionModel } from './promotion.interface';

const promotionSchema = new Schema<IPromotionDocument, IPromotionModel>(
    {
        code: {
            type: String,
            required: [true, 'Coupon code is required'],
            trim: true,
            uppercase: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Promotion name is required'],
            trim: true,
        },
        description: { type: String, trim: true },
        type: {
            type: String,
            required: true,
            enum: { values: ['percent', 'fixed'], message: '{VALUE} is not a valid discount type' },
        },
        value: {
            type: Number,
            required: [true, 'Discount value is required'],
            min: [0, 'Value cannot be negative'],
        },
        currency: { type: String, trim: true, default: 'BDT' },
        minOrderAmount: { type: Number, min: 0, default: 0 },
        maxDiscountAmount: { type: Number, min: 0 },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        usageLimit: { type: Number, default: 0, min: 0 },
        usagePerClient: { type: Number, default: 1, min: 0 },
        firstOrderOnly: { type: Boolean, default: false },
        productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
        productTypes: [{ type: String, trim: true }],
        productBillingCycles: [{ type: String, trim: true }],
        domainTlds: [{ type: String, trim: true }],
        domainBillingCycles: [{ type: String, trim: true }],
        isActive: { type: Boolean, default: true, index: true },
        usageCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

promotionSchema.index({ code: 1, isActive: 1 });
promotionSchema.index({ startDate: 1, endDate: 1 });

promotionSchema.statics.isCodeTaken = async function (code: string, excludeId?: string): Promise<boolean> {
    const query: any = { code: code.toUpperCase().trim() };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await this.findOne(query);
    return !!existing;
};

const Promotion = mongoose.model<IPromotionDocument, IPromotionModel>('Promotion', promotionSchema);
export default Promotion;

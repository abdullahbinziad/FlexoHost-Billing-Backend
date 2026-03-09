import mongoose, { Schema } from 'mongoose';
import type { IPromotionUsageDocument } from './promotion.interface';

const promotionUsageSchema = new Schema<IPromotionUsageDocument>(
    {
        promotionId: { type: Schema.Types.ObjectId, ref: 'Promotion', required: true, index: true },
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        discountAmount: { type: Number, required: true, min: 0 },
        usedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

promotionUsageSchema.index({ promotionId: 1, clientId: 1 });

const PromotionUsage = mongoose.model<IPromotionUsageDocument>('PromotionUsage', promotionUsageSchema);
export default PromotionUsage;

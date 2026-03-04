import mongoose, { Schema } from 'mongoose';
import { IOrderItemDocument, IOrderItemModel, DomainActionType } from './order-item.interface';
import { ServiceType, BillingCycle } from '../services/types/enums';

const pricingSnapshotSchema = new Schema(
    {
        setup: { type: Number, required: true, default: 0 },
        recurring: { type: Number, required: true, default: 0 },
        discount: { type: Number, required: true, default: 0 },
        tax: { type: Number, required: true, default: 0 },
        total: { type: Number, required: true, default: 0 },
        currency: { type: String, required: true },
    },
    { _id: false }
);

const orderItemSchema = new Schema<IOrderItemDocument, IOrderItemModel>(
    {
        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            index: true,
        },
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: Object.values(ServiceType),
            required: true,
            index: true,
        },
        actionType: {
            type: String,
            enum: Object.values(DomainActionType),
        },
        productId: {
            type: String,
        },
        nameSnapshot: {
            type: String,
            required: true,
        },
        billingCycle: {
            type: String,
            enum: Object.values(BillingCycle),
            required: true,
        },
        qty: {
            type: Number,
            required: true,
            default: 1,
            min: 1,
        },
        pricingSnapshot: {
            type: pricingSnapshotSchema,
            required: true,
        },
        configSnapshot: {
            type: Schema.Types.Mixed,
            required: true,
        },
    },
    { timestamps: true, }
);

// Helpful index to lookup an order's items easily by type
orderItemSchema.index({ orderId: 1, type: 1 });

const OrderItem = mongoose.model<IOrderItemDocument, IOrderItemModel>('OrderItem', orderItemSchema);

export default OrderItem;

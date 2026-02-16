import mongoose, { Schema } from 'mongoose';
import { IOrderDocument, IOrderModel, OrderStatus, OrderItemType, BillingCycle } from './order.interface';

const orderItemSchema = new Schema(
    {
        productId: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: Object.values(OrderItemType),
            required: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        billingCycle: {
            type: String,
            enum: Object.values(BillingCycle),
        },
        serverLocation: {
            type: String,
            trim: true,
        },
        domainDetails: {
            domainName: String,
            authCode: String,
            registrationYears: Number,
        },
    },
    { _id: false }
);

const orderSchema = new Schema<IOrderDocument, IOrderModel>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        invoiceId: {
            type: Schema.Types.ObjectId,
            ref: 'Invoice',
            required: true,
            unique: true,
        },
        status: {
            type: String,
            enum: Object.values(OrderStatus),
            default: OrderStatus.PENDING,
            index: true,
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            required: true,
            default: 'USD',
            trim: true,
        },
        paymentMethod: {
            type: String,
            trim: true,
        },
        items: [orderItemSchema],
        transactionId: {
            type: String,
            trim: true,
        },
        metadata: {
            type: Map,
            of: Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

const Order = mongoose.model<IOrderDocument, IOrderModel>('Order', orderSchema);

export default Order;

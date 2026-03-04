import mongoose, { Schema } from 'mongoose';
import { IOrderDocument, IOrderModel, OrderStatus } from './order.interface';

const orderSchema = new Schema<IOrderDocument, IOrderModel>(
    {
        orderId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        orderNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(OrderStatus),
            default: OrderStatus.PENDING_PAYMENT,
            index: true,
        },
        currency: {
            type: String,
            required: true,
            default: 'USD',
        },
        subtotal: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        discountTotal: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        taxTotal: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        total: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        invoiceId: {
            type: Schema.Types.ObjectId,
            ref: 'Invoice',
            index: true,
        },
        paidAt: {
            type: Date,
        },
        meta: {
            type: Schema.Types.Mixed, // Safe cart snapshot
        },
    },
    {
        timestamps: true,
    }
);

orderSchema.statics.isOrderNumberTaken = async function (orderNumber: string): Promise<boolean> {
    const order = await this.findOne({ orderNumber });
    return !!order;
};

const Order = mongoose.model<IOrderDocument, IOrderModel>('Order', orderSchema);

export default Order;

import mongoose, { Schema } from 'mongoose';
import {
    IPaymentTransactionDocument,
    IPaymentTransactionModel,
    TransactionStatus,
    TransactionType,
} from './transaction.interface';

const paymentTransactionSchema = new Schema<IPaymentTransactionDocument, IPaymentTransactionModel>(
    {
        invoiceId: {
            type: Schema.Types.ObjectId,
            ref: 'Invoice',
            index: true,
        },
        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            index: true,
        },
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        gateway: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: Object.values(TransactionType),
            required: true,
            default: TransactionType.CHARGE,
        },
        status: {
            type: String,
            enum: Object.values(TransactionStatus),
            required: true,
            default: TransactionStatus.SUCCESS,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            required: true,
            trim: true,
        },
        paymentDate: { type: Date },
        fxSnapshot: {
            baseCurrency: { type: String, trim: true },
            fxRateToBase: { type: Number, min: 0 },
            fxDate: { type: Date },
            amountInBase: { type: Number, min: 0 },
        },
        fxSnapshotLegacy: { type: Boolean, default: false },
        externalTransactionId: {
            type: String,
            trim: true,
            index: true,
        },
        gatewayPayload: {
            type: Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
    }
);

paymentTransactionSchema.index(
    { gateway: 1, externalTransactionId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            externalTransactionId: { $exists: true, $type: 'string', $ne: '' },
        },
    }
);

const PaymentTransaction = mongoose.model<IPaymentTransactionDocument, IPaymentTransactionModel>(
    'PaymentTransaction',
    paymentTransactionSchema
);

export default PaymentTransaction;


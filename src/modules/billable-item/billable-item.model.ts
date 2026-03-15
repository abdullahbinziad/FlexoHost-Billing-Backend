import mongoose, { Schema } from 'mongoose';
import { IBillableItemDocument, InvoiceAction, RecurUnit } from './billable-item.interface';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../../config/currency.config';

const billableItemSchema = new Schema<IBillableItemDocument>(
    {
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            required: true,
            index: true,
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            default: null,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        unitType: {
            type: String,
            enum: ['hours', 'qty'],
            default: 'hours',
        },
        hoursOrQty: {
            type: Number,
            default: 0,
            min: 0,
        },
        amount: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        invoiceAction: {
            type: String,
            enum: Object.values(InvoiceAction),
            default: InvoiceAction.DONT_INVOICE,
        },
        dueDate: {
            type: Date,
            required: true,
        },
        recurEvery: { type: Number, min: 0, default: 0 },
        recurUnit: {
            type: String,
            enum: Object.values(RecurUnit),
            default: null,
        },
        recurCount: { type: Number, min: 0, default: 0 },
        invoiceCount: { type: Number, default: 0, min: 0 },
        invoiced: { type: Boolean, default: false },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
        currency: {
            type: String,
            required: true,
            default: DEFAULT_CURRENCY,
            enum: [...SUPPORTED_CURRENCIES],
        },
    },
    { timestamps: true }
);

billableItemSchema.index({ clientId: 1, invoiced: 1 });
billableItemSchema.index({ invoiceAction: 1 });
billableItemSchema.index({ dueDate: 1 });

const BillableItem = mongoose.model<IBillableItemDocument>('BillableItem', billableItemSchema);

export default BillableItem;

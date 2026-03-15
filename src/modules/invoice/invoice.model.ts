import mongoose, { Schema } from 'mongoose';
import { IInvoiceDocument, IInvoiceModel, InvoiceStatus, InvoiceItemType } from './invoice.interface';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../../config/currency.config';

const invoiceSchema = new Schema<IInvoiceDocument, IInvoiceModel>(
    {
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            required: true,
            index: true,
        },
        invoiceNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        status: {
            type: String,
            enum: Object.values(InvoiceStatus),
            default: InvoiceStatus.UNPAID,
            required: true,
        },
        invoiceDate: {
            type: Date,
            required: true,
            default: Date.now,
        },
        dueDate: {
            type: Date,
            required: true,
        },
        billedTo: {
            companyName: { type: String, trim: true },
            customerName: { type: String, required: true, trim: true },
            address: { type: String, required: true, trim: true },
            country: { type: String, required: true, trim: true },
        },
        items: [
            {
                type: {
                    type: String,
                    enum: Object.values(InvoiceItemType),
                    required: true,
                },
                description: { type: String, required: true, trim: true },
                period: {
                    startDate: { type: Date },
                    endDate: { type: Date },
                },
                amount: { type: Number, required: true, min: 0 },
                meta: { type: Schema.Types.Mixed },
            },
        ],
        currency: {
            type: String,
            required: true,
            default: DEFAULT_CURRENCY,
            trim: true,
            enum: [...SUPPORTED_CURRENCIES],
        },
        subTotal: {
            type: Number,
            required: true,
            min: 0,
        },
        discount: {
            type: Number,
            default: 0,
            min: 0,
        },
        credit: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        total: {
            type: Number,
            required: true,
            min: 0,
        },
        balanceDue: {
            type: Number,
            required: true,
            min: 0,
        },
        fxSnapshot: {
            baseCurrency: { type: String, trim: true },
            fxRateToBase: { type: Number, min: 0 },
            fxDate: { type: Date },
            subtotalInBase: { type: Number, min: 0 },
            taxInBase: { type: Number, min: 0, default: 0 },
            totalInBase: { type: Number, min: 0 },
            balanceDueInBase: { type: Number, min: 0 },
        },
        fxSnapshotLegacy: { type: Boolean, default: false },
        baseCurrency: { type: String, trim: true },
        totalInBase: { type: Number, min: 0 },
        balanceDueInBase: { type: Number, min: 0 },
        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
        },
        paymentMethod: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Static method to check if invoice number is taken
invoiceSchema.statics.isInvoiceNumberTaken = async function (
    invoiceNumber: string,
    excludeInvoiceId?: string
): Promise<boolean> {
    const invoice = await this.findOne({ invoiceNumber, _id: { $ne: excludeInvoiceId } });
    return !!invoice;
};

// Pre-save middleware: validate totals and balance only. FX snapshot is set in service at invoice date.
invoiceSchema.pre('save', function (next) {
    const invoice = this as IInvoiceDocument;

    const calculatedSubTotal = invoice.items.reduce((acc, item) => acc + item.amount, 0);
    const discount = invoice.discount ?? 0;

    invoice.subTotal = calculatedSubTotal;
    invoice.total = Math.max(0, invoice.subTotal - discount);
    invoice.balanceDue = invoice.total - invoice.credit;

    if (invoice.isNew) {
        invoice.status = InvoiceStatus.UNPAID;
    }

    next();
});

const Invoice = mongoose.model<IInvoiceDocument, IInvoiceModel>('Invoice', invoiceSchema);

export default Invoice;

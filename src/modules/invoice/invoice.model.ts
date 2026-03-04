import mongoose, { Schema } from 'mongoose';
import { IInvoiceDocument, IInvoiceModel, InvoiceStatus, InvoiceItemType } from './invoice.interface';

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
            default: 'BDT',
            trim: true,
        },
        subTotal: {
            type: Number,
            required: true,
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

// Pre-save middleware to validate totals and calculate balance
invoiceSchema.pre('save', function (next) {
    const invoice = this as IInvoiceDocument;

    // Calculate subTotal from items
    const calculatedSubTotal = invoice.items.reduce((acc, item) => acc + item.amount, 0);

    // Validate if provided subTotal matches calculated
    // Note: We might want to just force calculation here instead of validating user input
    // User requirement: "Invoice totals must be validated on backend" -> I will overwrite them to be safe and correct
    invoice.subTotal = calculatedSubTotal;
    invoice.total = invoice.subTotal; // + tax if needed later
    invoice.balanceDue = invoice.total - invoice.credit;

    if (invoice.isNew) {
        invoice.status = InvoiceStatus.UNPAID;
    }

    next();
});

const Invoice = mongoose.model<IInvoiceDocument, IInvoiceModel>('Invoice', invoiceSchema);

export default Invoice;

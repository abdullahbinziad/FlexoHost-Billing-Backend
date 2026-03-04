import mongoose, { Schema, Document } from 'mongoose';

export interface IRenewalLedger extends Document {
    serviceId: mongoose.Types.ObjectId;
    dueDate: Date;
    invoiceId: mongoose.Types.ObjectId;
    paidAt?: Date;
    paidInvoiceId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const renewalLedgerSchema = new Schema<IRenewalLedger>(
    {
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true },
        dueDate: { type: Date, required: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
        paidAt: { type: Date },
        paidInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' }
    },
    {
        timestamps: true,
    }
);

// Idempotency: Ensure exactly one ledger entry per service cycle due date
renewalLedgerSchema.index({ serviceId: 1, dueDate: 1 }, { unique: true });

export default mongoose.model<IRenewalLedger>('RenewalLedger', renewalLedgerSchema);

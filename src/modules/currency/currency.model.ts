import mongoose, { Schema, Document } from 'mongoose';

export interface ICurrencyDocument extends Document {
    code: string;
    name: string;
    symbol: string;
    locale?: string;
    enabled: boolean;
    decimalPlaces: number;
    isDefault: boolean;
}

const currencySchema = new Schema<ICurrencyDocument>(
    {
        code: { type: String, required: true, trim: true, uppercase: true, unique: true },
        name: { type: String, required: true, trim: true },
        symbol: { type: String, required: true, trim: true },
        locale: { type: String, trim: true },
        enabled: { type: Boolean, default: true },
        decimalPlaces: { type: Number, default: 2, min: 0, max: 6 },
        isDefault: { type: Boolean, default: false },
    },
    { timestamps: true }
);

currencySchema.index({ enabled: 1, code: 1 });

const Currency = mongoose.model<ICurrencyDocument>('Currency', currencySchema);

export default Currency;

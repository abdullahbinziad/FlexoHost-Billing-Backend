import mongoose, { Schema } from 'mongoose';
import { IExchangeRateDocument, IExchangeRateModel } from './exchange-rate.interface';

const exchangeRateSchema = new Schema<IExchangeRateDocument, IExchangeRateModel>(
    {
        date: { type: Date, required: true, index: true },
        currency: { type: String, required: true, trim: true, index: true },
        rateToBase: { type: Number, required: true, min: 0 },
        baseCurrency: { type: String, required: true, trim: true },
    },
    { timestamps: true }
);

exchangeRateSchema.index({ date: 1, currency: 1 }, { unique: true });

const ExchangeRate = mongoose.model<IExchangeRateDocument, IExchangeRateModel>(
    'ExchangeRate',
    exchangeRateSchema
);

export default ExchangeRate;

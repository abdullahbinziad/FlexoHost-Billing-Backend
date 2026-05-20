import { BASE_REPORTING_CURRENCY, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../../config/currency.config';
import Currency from './currency.model';

const FALLBACK_CURRENCIES = [
    { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', locale: 'bn-BD', enabled: true, decimalPlaces: 2, isDefault: DEFAULT_CURRENCY === 'BDT' },
    { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US', enabled: true, decimalPlaces: 2, isDefault: DEFAULT_CURRENCY === 'USD' },
];

function normalizeCode(code: string) {
    return String(code || '').trim().toUpperCase();
}

class CurrencyService {
    private async ensureDefaults() {
        const count = await Currency.estimatedDocumentCount();
        if (count > 0) return;
        await Currency.insertMany(FALLBACK_CURRENCIES, { ordered: false });
    }

    async listEnabled() {
        await this.ensureDefaults();
        const currencies = await Currency.find({ enabled: true }).sort({ isDefault: -1, code: 1 }).lean();
        return {
            currencies,
            defaultCurrency: DEFAULT_CURRENCY,
            baseReportingCurrency: BASE_REPORTING_CURRENCY,
        };
    }

    async listAdmin() {
        await this.ensureDefaults();
        return Currency.find().sort({ isDefault: -1, code: 1 }).lean();
    }

    async upsert(payload: {
        code: string;
        name: string;
        symbol: string;
        locale?: string;
        enabled?: boolean;
        decimalPlaces?: number;
        isDefault?: boolean;
    }) {
        const code = normalizeCode(payload.code);
        if (!/^[A-Z]{3}$/.test(code)) throw new Error('Currency code must be a 3-letter ISO code');

        if (payload.isDefault) {
            await Currency.updateMany({ code: { $ne: code } }, { $set: { isDefault: false } });
        }

        return Currency.findOneAndUpdate(
            { code },
            {
                code,
                name: payload.name.trim(),
                symbol: payload.symbol.trim(),
                locale: payload.locale?.trim(),
                enabled: payload.enabled ?? true,
                decimalPlaces: payload.decimalPlaces ?? 2,
                isDefault: payload.isDefault ?? code === DEFAULT_CURRENCY,
            },
            { upsert: true, new: true, runValidators: true }
        ).lean();
    }

    async isEnabledCurrency(code: string) {
        const normalized = normalizeCode(code);
        if (!normalized) return false;
        await this.ensureDefaults();
        const stored = await Currency.exists({ code: normalized, enabled: true });
        if (stored) return true;
        return SUPPORTED_CURRENCIES.includes(normalized as any);
    }
}

export default new CurrencyService();

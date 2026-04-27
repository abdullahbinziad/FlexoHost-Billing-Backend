import config from '../../config';

let runtimeBdtToBaseRate = config.reporting.exchangeRateBdt;

const MIN_RATE = 0.000001;

export function getRuntimeBdtRateToBase(): number {
    return runtimeBdtToBaseRate;
}

export function setRuntimeBdtRateToBase(rate: number | null | undefined): number {
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < MIN_RATE) {
        return runtimeBdtToBaseRate;
    }
    runtimeBdtToBaseRate = parsed;
    return runtimeBdtToBaseRate;
}

export function getRuntimeExchangeRatesToBase(baseCurrency: string): Record<string, number> {
    const base = (baseCurrency || 'USD').trim().toUpperCase() || 'USD';
    if (base === 'BDT') {
        return {
            BDT: 1,
            USD: 1 / runtimeBdtToBaseRate,
        };
    }
    return {
        USD: 1,
        BDT: runtimeBdtToBaseRate,
    };
}

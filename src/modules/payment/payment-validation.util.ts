import ApiError from '../../utils/apiError';

function normalizeCurrency(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeAmount(value: unknown): number {
    const amount = Number(value);
    return Number.isFinite(amount) ? Number(amount.toFixed(2)) : NaN;
}

export function assertPaymentMatchesInvoice(input: {
    invoiceBalanceDue: number;
    invoiceCurrency: string;
    paidAmount: unknown;
    paidCurrency: unknown;
}): { amount: number; currency: string } {
    const expectedAmount = normalizeAmount(input.invoiceBalanceDue);
    const actualAmount = normalizeAmount(input.paidAmount);
    const expectedCurrency = normalizeCurrency(input.invoiceCurrency);
    const actualCurrency = normalizeCurrency(input.paidCurrency);

    if (!Number.isFinite(actualAmount) || actualAmount <= 0) {
        throw new ApiError(400, 'Invalid payment amount received from gateway');
    }

    if (!actualCurrency) {
        throw new ApiError(400, 'Invalid payment currency received from gateway');
    }

    if (expectedCurrency !== actualCurrency) {
        throw new ApiError(400, `Payment currency mismatch. Expected ${expectedCurrency}, got ${actualCurrency}`);
    }

    if (Math.abs(expectedAmount - actualAmount) > 0.01) {
        throw new ApiError(400, `Payment amount mismatch. Expected ${expectedAmount}, got ${actualAmount}`);
    }

    return { amount: actualAmount, currency: actualCurrency };
}

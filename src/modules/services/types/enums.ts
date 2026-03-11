export enum ServiceType {
    DOMAIN = 'DOMAIN',
    HOSTING = 'HOSTING',
    VPS = 'VPS',
    EMAIL = 'EMAIL',
    LICENSE = 'LICENSE',
}

export enum ServiceStatus {
    PENDING = 'PENDING',
    PROVISIONING = 'PROVISIONING',
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    TERMINATED = 'TERMINATED',
    FAILED = 'FAILED',
}

export enum BillingCycle {
    MONTHLY = 'monthly',
    QUARTERLY = 'quarterly',
    SEMIANNUALLY = 'semiannually',
    ANNUALLY = 'annually',
    BIENNIALLY = 'biennially',
    TRIENNIALLY = 'triennially',
    ONE_TIME = 'one-time',
}

const BILLING_CYCLE_VALUES = Object.values(BillingCycle) as string[];

/** Normalize any input to a valid BillingCycle enum value (lowercase). Use when creating Service or OrderItem. */
export function normalizeBillingCycle(value: unknown): BillingCycle {
    if (value == null || value === '') return BillingCycle.MONTHLY;
    const raw = String(value).trim().toLowerCase().replace(/\s+/g, '-');
    const normalized = raw === 'one-time' || raw === 'one time' ? BillingCycle.ONE_TIME : raw;
    return BILLING_CYCLE_VALUES.includes(normalized) ? (normalized as BillingCycle) : BillingCycle.MONTHLY;
}

export enum ProvisioningJobStatus {
    QUEUED = 'QUEUED',
    RUNNING = 'RUNNING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export enum ServiceActionType {
    SUSPEND = 'SUSPEND',
    UNSUSPEND = 'UNSUSPEND',
    TERMINATE = 'TERMINATE',
}

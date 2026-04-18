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
    /** Ended on the server (WHM terminate, etc.) */
    TERMINATED = 'TERMINATED',
    /** Cancelled before activation — no WHM terminate; distinct from terminated */
    CANCELLED = 'CANCELLED',
    FAILED = 'FAILED',
}

const SERVICE_STATUS_VALUES = new Set<string>(Object.values(ServiceStatus));

/**
 * Normalize arbitrary status input to canonical ServiceStatus enum.
 * Accepts common aliases and defaults safely to PENDING.
 */
export function normalizeServiceStatus(value: unknown): ServiceStatus {
    const raw = String(value || '').trim().toUpperCase();
    if (SERVICE_STATUS_VALUES.has(raw)) return raw as ServiceStatus;
    if (raw === 'CANCELED') return ServiceStatus.CANCELLED;
    if (raw === 'TERMINATE' || raw.includes('TERMINAT')) return ServiceStatus.TERMINATED;
    if (raw.includes('SUSPEND')) return ServiceStatus.SUSPENDED;
    if (raw.includes('CANCEL')) return ServiceStatus.CANCELLED;
    return ServiceStatus.PENDING;
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

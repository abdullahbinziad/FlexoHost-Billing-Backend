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

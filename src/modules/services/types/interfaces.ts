import { ServiceType, ServiceStatus, BillingCycle } from './enums';

export interface PriceSnapshot {
    setup: number;
    recurring: number;
    discount: number;
    tax: number;
    total: number;
    currency: string;
}

export interface ProvisioningMeta {
    provider?: string;
    remoteId?: string;
    lastSyncedAt?: Date;
    lastError?: string;
}

export interface BaseServiceCreateInput {
    clientId: string;
    orderId?: string;
    type: ServiceType;
    status?: ServiceStatus;
    billingCycle: BillingCycle;
    price: PriceSnapshot;
    provisioningMeta?: ProvisioningMeta;
}

export interface BaseServiceResponse {
    id: string;
    clientId: string;
    orderId?: string;
    type: ServiceType;
    status: ServiceStatus;
    billingCycle: BillingCycle;
    price: PriceSnapshot;
    provisioningMeta?: ProvisioningMeta;
    createdAt: Date;
    updatedAt: Date;
}

import type { ServiceType } from '../types/enums';

/**
 * Context passed to each provisioning provider.
 * All entities are plain objects or Mongoose documents as returned by the worker.
 */
export interface ProvisioningContext {
    /** Order document (or lean) */
    order: any;
    /** Order item document (or lean) */
    orderItem: any;
    /** Client document (or lean) */
    client: any;
    /** Service document just created with status PROVISIONING (used for serviceId when persisting details) */
    service: any;
    /** Resolved product document if order item has productId (optional) */
    product?: any;
}

/**
 * Standard result returned by every provisioning provider.
 * details: type-specific payload for the worker to persist in the corresponding detail model.
 */
export interface ProvisioningResult {
    success: boolean;
    /** External/remote resource id (e.g. WHM username, registrar order id) */
    remoteId?: string | null;
    /** Provider name for service.provisioning.provider (e.g. 'whm', 'dynadot') */
    providerName?: string;
    /** Payload to persist in the type-specific detail model (serviceId will be set by worker) */
    details?: Record<string, unknown>;
    /** Error message when success is false */
    error?: string;
}

/**
 * Contract for all provisionable item types.
 * Register implementations in the provider registry by ServiceType.
 */
export interface IProvisioningProvider {
    readonly type: ServiceType;
    /**
     * Perform provisioning (selection + external API call).
     * Must not create Service or detail records; only return result with details to persist.
     */
    provision(ctx: ProvisioningContext): Promise<ProvisioningResult>;
}

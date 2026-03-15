import { Document, Model, Types } from 'mongoose';

/** Scope of the grant: all services, all of a type, or specific service IDs. */
export type GrantScope = 'all' | 'service_type' | 'specific_services';

/** Permission level: view = read-only, manage = can login, create emails, etc. */
export type GrantPermission = 'view' | 'manage';

/** Areas the grantee can access when managing the client's account. */
export interface IGrantAccessAreas {
    /** Can view/manage invoices. Default true when not set (backward compat). */
    allowInvoices?: boolean;
    /** Can view/create tickets. Default true when not set. */
    allowTickets?: boolean;
    /** Can view orders / billing history. Default true when not set. */
    allowOrders?: boolean;
}

export interface IClientAccessGrant {
    /** Client whose resources are shared. */
    clientId: Types.ObjectId;
    /** User who receives access (grantee). */
    granteeUserId: Types.ObjectId;
    /** Who created the grant (owner). */
    createdByUserId: Types.ObjectId;
    /** Scope of access (for services only). */
    scope: GrantScope;
    /** When scope is service_type: HOSTING | VPS | DOMAIN | EMAIL | LICENSE. */
    serviceType?: string;
    /** When scope is specific_services: list of service IDs. */
    serviceIds?: Types.ObjectId[];
    /** Permissions granted (view/manage for services). */
    permissions: GrantPermission[];
    /** Optional expiry. */
    expiresAt?: Date;
    /** Granular access: invoices, tickets, orders. Omitted = true (full). */
    allowInvoices?: boolean;
    allowTickets?: boolean;
    allowOrders?: boolean;
}

export interface IClientAccessGrantDocument extends IClientAccessGrant, Document {
    createdAt: Date;
    updatedAt: Date;
}

export interface IClientAccessGrantModel extends Model<IClientAccessGrantDocument> {}

/** Result of access check: allowed + optional filter for listing services. */
export interface GrantAccessResult {
    allowed: boolean;
    isOwner: boolean;
    isGrantee: boolean;
    /** When grantee: only these service IDs allowed (if specific_services). */
    allowedServiceIds?: string[];
    /** When grantee: only this service type allowed (if service_type). */
    allowedServiceType?: string;
    /** Resolved permissions for this access. */
    permissions?: GrantPermission[];
    /** When grantee: which areas are allowed (default true when not set). */
    allowInvoices?: boolean;
    allowTickets?: boolean;
    allowOrders?: boolean;
}

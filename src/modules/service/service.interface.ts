import { Document, Model, Types } from 'mongoose';

export enum ServiceStatus {
    PENDING = 'PENDING',
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    TERMINATED = 'TERMINATED',
    CANCELLED = 'CANCELLED',
}

export enum ServiceType {
    HOSTING = 'HOSTING',
    DOMAIN = 'DOMAIN',
    SERVER = 'SERVER',
    EMAIL = 'EMAIL',
}

export enum BillingCycle {
    MONTHLY = 'monthly',
    ANNUALLY = 'annually',
    TRIENNIALLY = 'triennially',
}

export enum AccessLevel {
    READ = 'READ',
    MANAGE = 'MANAGE',
    FULL = 'FULL',
}

export interface IServicePermission {
    userId: Types.ObjectId;
    accessLevel: AccessLevel;
}

// Specific details for each service type
export interface IHostingDetails {
    username?: string;
    password?: string; // Encrypted
    serverIp?: string;
    nameservers?: string[];
    package?: string;
    controlPanelUrl?: string; // e.g. cPanel URL
}

export interface IDomainDetails {
    domainName: string;
    registrar?: string;
    registrationDate?: Date;
    expiryDate?: Date;
    nameservers?: string[];
    authCode?: string;
    autoRenew?: boolean;
}

export interface IServerDetails {
    ipAddress?: string;
    rootPassword?: string; // Encrypted
    os?: string;
    cpu?: string;
    ram?: string;
    storage?: string;
}

export interface IEmailDetails {
    emailCount?: number;
    quota?: string;
}

export interface IService {
    userId: Types.ObjectId;
    orderId: Types.ObjectId;
    clientId?: number;
    type: ServiceType;
    productId: string;
    productName: string;

    // Common fields
    status: ServiceStatus;
    billingCycle?: BillingCycle;
    recurringAmount: number;
    currency: string;

    // Dates
    startDate: Date;
    nextDueDate: Date;
    lastPaymentDate?: Date;

    // Permissions
    permissions: IServicePermission[];

    // Specific Details (Optional based on type)
    hostingDetails?: IHostingDetails;
    domainDetails?: IDomainDetails;
    serverDetails?: IServerDetails;
    emailDetails?: IEmailDetails;

    // Server Location
    serverLocation?: string;

    createdAt: Date;
    updatedAt: Date;
}

export interface IServiceDocument extends IService, Document { }

export interface IServiceModel extends Model<IServiceDocument> {
    // Add static methods if needed
}

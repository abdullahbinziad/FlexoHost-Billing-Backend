import mongoose, { Schema, Document } from 'mongoose';

export enum DomainOperationType {
    REGISTER = 'REGISTER',
    TRANSFER = 'TRANSFER',
}

export enum DomainTransferStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
}

export enum DomainLifecycleStatus {
    PENDING_REGISTRATION = 'PENDING_REGISTRATION',
    PENDING_TRANSFER = 'PENDING_TRANSFER',
    ACTIVE = 'ACTIVE',
    GRACE_PERIOD_EXPIRED = 'GRACE_PERIOD_EXPIRED',
    REDEMPTION_PERIOD_EXPIRED = 'REDEMPTION_PERIOD_EXPIRED',
    EXPIRED = 'EXPIRED',
    TRANSFERRED_AWAY = 'TRANSFERRED_AWAY',
    CANCELLED = 'CANCELLED',
    FRAUD = 'FRAUD',
}

export const DOMAIN_LIFECYCLE_STATUS_LABELS: Record<DomainLifecycleStatus, string> = {
    [DomainLifecycleStatus.PENDING_REGISTRATION]: 'Pending Registration',
    [DomainLifecycleStatus.PENDING_TRANSFER]: 'Pending Transfer',
    [DomainLifecycleStatus.ACTIVE]: 'Active',
    [DomainLifecycleStatus.GRACE_PERIOD_EXPIRED]: 'Grace Period (Expired)',
    [DomainLifecycleStatus.REDEMPTION_PERIOD_EXPIRED]: 'Redemption Period (Expired)',
    [DomainLifecycleStatus.EXPIRED]: 'Expired',
    [DomainLifecycleStatus.TRANSFERRED_AWAY]: 'Transferred Away',
    [DomainLifecycleStatus.CANCELLED]: 'Cancelled',
    [DomainLifecycleStatus.FRAUD]: 'Fraud',
};

export const DOMAIN_LIFECYCLE_STATUS_OPTIONS = Object.values(DomainLifecycleStatus).map((value) => ({
    value,
    label: DOMAIN_LIFECYCLE_STATUS_LABELS[value],
}));

export interface IDomainContact {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address1: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
}

export interface IDomainServiceDetails extends Document {
    serviceId: mongoose.Types.ObjectId;
    domainName: string;
    sld: string;
    tld: string;
    registrar: string;
    operationType: DomainOperationType;
    transferStatus?: DomainTransferStatus;
    eppCodeEncrypted?: string;
    contacts: {
        registrant: IDomainContact;
        admin: IDomainContact;
        tech: IDomainContact;
        billing: IDomainContact;
    };
    contactsSameAsRegistrant: boolean;
    nameservers: string[];
    dnsRecords?: Array<{
        type: string;
        name?: string;
        value: string;
        priority?: number;
        ttl?: number;
    }>;
    registrarLock: boolean;
    whoisPrivacy: boolean;
    dnssecEnabled: boolean;
    dnsManagementEnabled: boolean;
    emailForwardingEnabled: boolean;
    registeredAt?: Date;
    expiresAt?: Date;
    transferredAt?: Date;
    registrarDomainId?: string;
    registrarOrderId?: string;
    eppStatusCodes: string[];
    registrarStatus?: string;
    lifecycleStatus?: DomainLifecycleStatus;
    lifecycleReason?: string;
    lifecycleUpdatedAt?: Date;
    lastAutoStatusAt?: Date;
    lastManualStatusAt?: Date;
    manualStatusOverrideUntil?: Date;
    syncStatus?: 'success' | 'failure' | 'pending';
    syncMessage?: string;
    source?: 'billing' | 'registrar_import';
    lastRegistrarSyncAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const contactSchema = new Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address1: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postcode: { type: String, required: true },
    country: { type: String, required: true },
}, { _id: false });

const domainServiceDetailsSchema = new Schema<IDomainServiceDetails>({
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true, unique: true },
    domainName: { type: String, required: true },
    sld: { type: String, required: true },
    tld: { type: String, required: true },
    registrar: { type: String, required: true },
    operationType: { type: String, enum: Object.values(DomainOperationType), required: true },
    transferStatus: { type: String, enum: Object.values(DomainTransferStatus) },
    eppCodeEncrypted: {
        type: String,
        required: function (this: IDomainServiceDetails): boolean { return this.operationType === DomainOperationType.TRANSFER; },
        select: false // Never return raw EPP code by default
    },
    contacts: {
        registrant: { type: contactSchema, required: true },
        admin: { type: contactSchema, required: true },
        tech: { type: contactSchema, required: true },
        billing: { type: contactSchema, required: true },
    },
    contactsSameAsRegistrant: { type: Boolean, default: true },
    nameservers: {
        type: [String],
        validate: [
            (val: string[]) => val.length >= 2 && val.length <= 13,
            'Nameservers array must have between 2 and 13 items'
        ],
        required: true
    },
    dnsRecords: {
        type: [
            {
                type: { type: String },
                name: { type: String },
                value: { type: String },
                priority: { type: Number },
                ttl: { type: Number },
            },
        ],
        default: [],
    },
    registrarLock: { type: Boolean, default: true },
    whoisPrivacy: { type: Boolean, default: false },
    dnssecEnabled: { type: Boolean, default: false },
    dnsManagementEnabled: { type: Boolean, default: false },
    emailForwardingEnabled: { type: Boolean, default: false },
    registeredAt: { type: Date },
    expiresAt: { type: Date },
    transferredAt: { type: Date },
    registrarDomainId: { type: String },
    registrarOrderId: { type: String },
    eppStatusCodes: { type: [String], default: [] },
    registrarStatus: { type: String },
    lifecycleStatus: {
        type: String,
        enum: Object.values(DomainLifecycleStatus),
        default: DomainLifecycleStatus.PENDING_REGISTRATION,
        index: true,
    },
    lifecycleReason: { type: String },
    lifecycleUpdatedAt: { type: Date },
    lastAutoStatusAt: { type: Date },
    lastManualStatusAt: { type: Date },
    manualStatusOverrideUntil: { type: Date },
    syncStatus: {
        type: String,
        enum: ['success', 'failure', 'pending'],
        default: 'pending',
    },
    syncMessage: { type: String },
    source: {
        type: String,
        enum: ['billing', 'registrar_import'],
        default: 'billing',
    },
    lastRegistrarSyncAt: { type: Date },
}, { timestamps: true });

domainServiceDetailsSchema.index({ domainName: 1 });
domainServiceDetailsSchema.index({ registrar: 1, domainName: 1 });

const DomainServiceDetails = mongoose.model<IDomainServiceDetails>('DomainServiceDetails', domainServiceDetailsSchema);
export default DomainServiceDetails;

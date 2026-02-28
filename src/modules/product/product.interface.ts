import { Document, Model } from 'mongoose';

/**
 * Product Types
 */
export type ProductType = 'hosting' | 'vps' | 'domain' | 'ssl';
export type PaymentType = 'free' | 'one-time' | 'recurring';
export type ModuleName = 'cpanel' | 'directadmin' | 'plesk' | 'virtualizor' | 'none';
export type FreeDomainType = 'none' | 'once' | 'recurring';
export type Currency = 'BDT' | 'USD' | 'EUR' | 'GBP';

/**
 * Pricing Detail Interface
 */
export interface IPricingDetail {
    price: number;
    setupFee: number;
    renewPrice: number;
    enable: boolean;
}

/**
 * Currency Pricing Interface
 */
export interface ICurrencyPricing {
    currency: Currency;
    monthly: IPricingDetail;
    quarterly: IPricingDetail;
    semiAnnually: IPricingDetail;
    annually: IPricingDetail;
    biennially: IPricingDetail;
    triennially: IPricingDetail;
}

/**
 * Module Configuration Interface
 */
export interface IModuleConfig {
    name: ModuleName;
    serverGroup?: string;
    packageName?: string;
}

/**
 * Free Domain Settings Interface
 */
export interface IFreeDomain {
    enabled: boolean;
    type: FreeDomainType;
    paymentTerms?: string[];
    tlds?: string[];
}

/**
 * Product Interface
 */
export interface IProduct {
    name: string;
    type: ProductType;
    group: string;
    description?: string;
    pid: number;

    // Pricing Configuration
    paymentType: PaymentType;
    pricing?: ICurrencyPricing[];

    // Features
    features: string[];
    stock?: number;

    // Module Configuration
    module?: IModuleConfig;

    // Free Domain Settings
    freeDomain?: IFreeDomain;

    // Metadata
    isHidden: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Product Document Interface (Mongoose Document)
 */
export interface IProductDocument extends IProduct, Document {
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Product Model Interface
 */
export interface IProductModel extends Model<IProductDocument> { }

/**
 * Query Filter Interface
 */
export interface IProductQueryFilter {
    type?: ProductType;
    group?: string;
    isHidden?: boolean;
    page?: number;
    limit?: number;
    sort?: string;
}

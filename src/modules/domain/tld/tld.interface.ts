import { Document } from 'mongoose';

export interface ITLDPricingDetail {
    register: number;
    renew: number;
    transfer: number;
    enable: boolean;
}

export interface ITLDCurrencyPricing {
    currency: string;
    "1": ITLDPricingDetail;
    "2": ITLDPricingDetail;
    "3": ITLDPricingDetail;
}

export interface ITLDAutoRegistration {
    enabled: boolean;
    provider: string;
}

export interface ITLDFeatures {
    dnsManagement: boolean;
    emailForwarding: boolean;
    idProtection: boolean;
}

export interface ITLD extends Document {
    tld: string;
    isSpotlight: boolean;
    label?: string;
    serial: number;
    pricing: ITLDCurrencyPricing[];
    features: ITLDFeatures;
    autoRegistration: ITLDAutoRegistration;
    status: string;
}

import { Document } from 'mongoose';

export interface ITLDPcingTier {
    register: number;
    transfer: number;
    renewal: number;
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
    register: string;
    serial: number;
    pricing: {
        year: number;
        register: number;
        renew: number;
        transfer: number;
    }[];
    features: ITLDFeatures;
    autoRegistration: ITLDAutoRegistration;
    status: string;
}

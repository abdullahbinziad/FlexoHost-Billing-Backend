export interface IDomainAvailability {
    domain: string;
    available: boolean;
    premium?: boolean;
}

export interface IDomainSearchResult extends IDomainAvailability {
    pricing?: {
        USD: number;
        BDT: number;
    };
}

export interface IDomainBulkRegistrationItem {
    domain: string;
    duration?: number;
}

export interface IDomainBulkRegistrationPayload {
    domains: IDomainBulkRegistrationItem[];
}

export interface IDomainRegistrationPayload {
    domain: string;
    duration: number; // in years
    nameservers?: string[];
    contacts?: {
        registrant: number | any; // ID or full object
        admin?: number | any;
        tech?: number | any;
        billing?: number | any;
    };
    // Additional fields for other registrars (e.g. Namely Partner API)
    purpose?: string;
    customerId?: number;
    /** Required for Namely unless defaults are set on the registrar config. */
    namelyRegistrant?: {
        name: string;
        email: string;
        phone: string;
        address: string;
        nid?: string;
        city: string;
        country: string;
    };
}

export interface IDomainTransferPayload {
    domain: string;
    authCode: string;
}

export interface IDomainDetails {
    domain: string;
    status: string;
    expirationDate: Date;
    nameservers: string[];
    locked: boolean;
    autoRenew: boolean;
    contacts?: {
        registrant?: any;
        admin?: any;
        tech?: any;
        billing?: any;
    };
}

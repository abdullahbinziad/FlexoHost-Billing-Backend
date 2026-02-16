export interface IDomainSearchResult {
    domain: string;
    available: boolean;
    price?: number;
    currency?: string;
    premium?: boolean;
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
    // Additional fields for other registrars (e.g. Namely)
    purpose?: string;
    customerId?: number;
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

export interface IDomainRegistrar {
    name: string;
    searchDomain(domain: string): Promise<IDomainSearchResult>;
    registerDomain(payload: IDomainRegistrationPayload): Promise<any>;
    renewDomain(domain: string, duration: number): Promise<any>;
    transferDomain(payload: IDomainTransferPayload): Promise<any>;
    getDomainDetails(domain: string): Promise<IDomainDetails>;
    updateNameservers(domain: string, nameservers: string[]): Promise<void>;
}

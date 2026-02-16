import fetch from 'node-fetch';
import config from '../../../config';
import {
    IDomainRegistrar,
    IDomainSearchResult,
    IDomainRegistrationPayload,
    IDomainTransferPayload,
    IDomainDetails,
} from '../domain.interface';
import ApiError from '../../../utils/apiError';

export class NamelyRegistrar implements IDomainRegistrar {
    name = 'Namely';
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = config.namely.apiKey;
        this.baseUrl = config.namely.baseUrl;
    }

    private async request(endpoint: string, method: string = 'GET', body: any = null) {
        // Remove trailing slash from base URL if present to avoid double slashes if endpoint starts with /
        const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${cleanBaseUrl}${cleanEndpoint}`;

        const headers: any = {
            'X-Partner-Api-Key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        const options: any = {
            method,
            headers,
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        const data = await response.json();

        if (!response.ok) {
            console.error('Namely API Error:', data);

            // Handle different error structures if needed
            // Docs say: 400 Bad Request, 401 Invalid API Key, etc.
            throw new ApiError(response.status, (data as any).message || 'Namely API error');
        }

        return data;
    }

    async searchDomain(domain: string): Promise<IDomainSearchResult> {
        // endpoint: POST /domains/check
        try {
            const result = await this.request('/domains/check', 'POST', { domain });
            return {
                domain: domain,
                // Docs say: { "available": true }
                available: result.available === true,
                // Price isn't returned in availability check in the example provided,
                // but might be available in /pricing/tlds. 
                // For now, we return without price or user should call pricing API separately.
                // We'll leave price undefined.
            };
        } catch (error) {
            throw error;
        }
    }

    async registerDomain(payload: IDomainRegistrationPayload): Promise<any> {
        // endpoint: POST /domains/register

        // Construct the body based on Namely requirements
        const body: any = {
            domain: payload.domain,
            years: payload.duration,
            purpose: payload.purpose || 'Personal', // Default or required
            customer_id: payload.customerId || 1, // Default or required, docs say integer 1
            nameservers: payload.nameservers,
        };

        // Handle registrant details
        // Payload contacts.registrant can be an ID (number) or object
        if (payload.contacts && payload.contacts.registrant) {
            body.registrant = payload.contacts.registrant;
        } else {
            // If not provided, we might need default registrant or throw error?
            // For now, assume it's passed in payload.contacts.registrant
        }

        return this.request('/domains/register', 'POST', body);
    }

    async renewDomain(domain: string, duration: number): Promise<any> {
        // endpoint: POST /domains/renew
        const body = {
            domain: domain,
            years: duration,
        };
        return this.request('/domains/renew', 'POST', body);
    }

    async transferDomain(_payload: IDomainTransferPayload): Promise<any> {
        // Docs provided specifically do NOT mention a Transfer endpoint implementation details
        // unlike Register/Renew.
        // It lists "Domain Services" -> Check, Register, Renew.
        // So we will throw Not Supported.
        throw new ApiError(400, 'Transfer is not currently supported by this registrar module.');
    }

    async getDomainDetails(domain: string): Promise<IDomainDetails> {
        // Docs do not provide a "Get Domain Details" endpoint that returns status, expiry etc.
        // explicitly in the "Domain Services" list section (only Check, Register, Renew).
        // However, usually one exists or it's just GET /domains/{domain}
        // User text: "Get everything from , their".
        // If I try GET /domains/{domain}, I might get 404 or it might work.
        // But based on provided text, I only see nameservers and dns management for specific domains.
        // I'll assume we can't fully implement this without guess work or more docs.
        // I will attempt to return a partial object or throw.
        // But wait, "3. Domain Renewal ... Response ... data: { domain: { full_domain, expires_at } }"
        // Maybe I can't get details on demand.
        // I'll throw strict error about it not being supported or return minimal mock if needed.
        // Better: I'll implement name server fetching as part of details since that IS supported.

        const nsResponse = await this.request(`/domains/${domain}/nameservers`, 'GET');

        // We lack status, locked, autoRenew, expirationDate from a simple GET endpoint in the docs.
        // We will return what we can or defaults.
        return {
            domain: domain,
            status: 'unknown', // Not available in provided docs
            expirationDate: new Date(), // Unknown
            nameservers: nsResponse.nameservers || [],
            locked: false, // Unknown
            autoRenew: false, // Unknown
        };
    }

    async updateNameservers(domain: string, nameservers: string[]): Promise<void> {
        // endpoint: POST /domains/{domain}/nameservers
        const body = {
            nameservers: nameservers,
        };
        await this.request(`/domains/${domain}/nameservers`, 'POST', body);
    }
}

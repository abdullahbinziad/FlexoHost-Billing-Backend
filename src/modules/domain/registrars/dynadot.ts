import fetch from 'node-fetch';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import config from '../../../config';
import {
    IDomainRegistrar,
    IDomainSearchResult,
    IDomainRegistrationPayload,
    IDomainTransferPayload,
    IDomainDetails,
} from '../domain.interface';
import ApiError from '../../../utils/apiError';

export class DynadotRegistrar implements IDomainRegistrar {
    name = 'Dynadot';
    private apiKey: string;
    private apiSecret: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = config.dynadot.apiKey;
        this.apiSecret = config.dynadot.apiSecret;
        this.baseUrl = config.dynadot.baseUrl;
    }

    private generateSignature(
        path: string,
        requestId: string,
        body: string = ''
    ): string {
        // String to Sign: apiKey + "\n" + method + " " + fullPathAndQuery + "\n" + (xRequestId or "") + "\n" + (requestBody or "")
        // Note: The browser agent instructions said "fullPathAndQuery", usually this means the path + query string.
        // Also sometimes method is included. The browser agent summary said:
        // apiKey + "\n" + fullPathAndQuery + "\n" + (xRequestId or "") + "\n" + (requestBody or "")
        // Let's assume the browser agent summary is correct, but usually standard HMAC auth includes Method.
        // Checking the summary again:
        // "String to Sign: apiKey + "\n" + fullPathAndQuery + "\n" + (xRequestId or "") + "\n" + (requestBody or "")"
        // It didn't mention Method. I will follow the summary but be ready to debug.

        // Actually, let's verify if "fullPathAndQuery" should include the leading slash? Usually yes.

        const stringToSign = `${this.apiKey}\n${path}\n${requestId}\n${body}`;

        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(stringToSign)
            .digest('hex');
    }

    private async request(endpoint: string, method: string = 'GET', body: any = null) {
        const url = `${this.baseUrl}${endpoint}`;
        const requestId = uuidv4();

        const headers: any = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Request-ID': requestId,
        };

        let bodyString = '';
        if (body) {
            bodyString = JSON.stringify(body);
        }

        // Only generate signature for operations that write data (POST, PUT, DELETE) usually, 
        // but the summary said "Mandatory X-Signature header for registration, renewal, and updates".
        // Search is GET, details is GET.
        // Let's add it for everything just in case, or check payload.
        // Generate signature for all requests to be safe, as some GET requests might require it
        const signature = this.generateSignature(`/restful/v2${endpoint}`, requestId, bodyString);
        headers['X-Signature'] = signature;

        const options: any = {
            method,
            headers,
        };

        if (body) {
            options.body = bodyString;
        }

        const response = await fetch(url, options);
        let data;
        try {
            data = await response.json();
        } catch (e) {
            const text = await response.text();
            console.error('Dynadot API Non-JSON Response:', text);
            throw new ApiError(response.status || 500, 'Dynadot API returned non-JSON response');
        }

        if (!response.ok) {
            console.error('Dynadot API Error:', JSON.stringify(data, null, 2));
            throw new ApiError(response.status, (data as any).message || (data as any).error || 'Dynadot API error');
        }

        return data;
    }

    async searchDomain(domain: string): Promise<IDomainSearchResult> {
        // endpoint: /domains/{domain_name}/search
        try {
            const result = await this.request(`/domains/${domain}/search`);
            // Map Dynadot result to our interface
            // Structure depends on actual response, assuming standard fields based on docs summary
            return result;
        } catch (error) {
            // If api returns 404 or specific error for taken, handle it.
            // But usually search returns 200 with available=no
            throw error;
        }
    }

    async registerDomain(payload: IDomainRegistrationPayload): Promise<any> {
        // endpoint: /domains/{domain_name}/register
        const body = {
            duration: payload.duration,
            currency: 'USD', // Default to USD for now
            // Add contacts logic later if needed, complex structure
        };

        return this.request(`/domains/${payload.domain}/register`, 'POST', body);
    }

    async renewDomain(domain: string, duration: number): Promise<any> {
        const body = {
            duration: duration,
            currency: 'USD',
        };
        return this.request(`/domains/${domain}/renew`, 'POST', body);
    }

    async transferDomain(payload: IDomainTransferPayload): Promise<any> {
        const body = {
            auth_code: payload.authCode,
            currency: 'USD',
        };
        return this.request(`/domains/${payload.domain}/transfer_in`, 'POST', body);
    }

    async getDomainDetails(domain: string): Promise<IDomainDetails> {
        const result = await this.request(`/domains/${domain}`);

        return {
            domain: result.domain,
            status: result.status,
            expirationDate: new Date(result.expiration),
            nameservers: result.nameservers || [],
            locked: result.locked === 'yes',
            autoRenew: result.auto_renew === 'yes',
        };
    }

    async updateNameservers(domain: string, nameservers: string[]): Promise<void> {
        const body = {
            nameserver_list: nameservers,
        };
        await this.request(`/domains/${domain}/nameservers`, 'PUT', body);
    }
}

// Create single instance
const dynadotRegistrar = new DynadotRegistrar();

// Export only search function
export const searchDynadotDomain = (domain: string) => {
    return dynadotRegistrar.searchDomain(domain);
};
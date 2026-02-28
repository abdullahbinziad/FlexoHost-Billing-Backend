import { IDomainRegistrationPayload, } from './domain.interface';
import tldService from './tld/tld.service';
import ApiError from '../../utils/apiError';
import { searchDynadotDomain } from './registrars/dynadot';

class DomainService {
    async searchDomain(domain: string): Promise<any> {
        try {
            // 1️⃣ Extract SLD and Extension
            const parts = domain.split('.');
            if (parts.length < 2) {
                throw new ApiError(400, 'Invalid domain format');
            }


            const extension = `.${parts.slice(1).join('.')}`;

            // 2️⃣ Check TLD exists in DB
            const tldData = await tldService.getTLDByExtension(extension);
            if (!tldData) {
                throw new ApiError(404, 'TLD not supported');
            }

            // 3️⃣ Call Dynadot API
            const SearchResult = await searchDynadotDomain(domain);



            // Strip internal/unnecessary fields from tldData
            const tldObj = tldData.toObject ? tldData.toObject() : { ...tldData };
            const { features, autoRegistration, ...cleanTldData } = tldObj;

            return {
                domain,
                extension,
                dynadotResult: SearchResult?.data || SearchResult,
                tldData: cleanTldData
            };
        } catch (error) {
            throw error;
        }
    }

    async registerDomain(payload: IDomainRegistrationPayload): Promise<any> {
        // Implement domain registration logic here
        return { success: true, message: 'Domain registration initiated', domain: payload.domain };
    }

    async renewDomain(domain: string, duration: number): Promise<any> {
        return { success: true, message: 'Domain renewal initiated', domain, duration };
    }

    async transferDomain(payload: any): Promise<any> {
        return { success: true, message: 'Domain transfer initiated', domain: payload.domain };
    }

    async getDomainDetails(domainCode: string): Promise<any> {
        return { domain: domainCode, status: 'active', expirationDate: new Date() };
    }

    async updateNameservers(_domain: string, _nameservers: string[]): Promise<void> {
        // Implement nameserver update logic
    }
}

export default new DomainService();

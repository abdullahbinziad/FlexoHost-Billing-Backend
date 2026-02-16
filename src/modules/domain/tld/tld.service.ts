import { TLDModel } from './tld.model';
import { ITLD } from './tld.interface';
import ApiError from '../../../utils/apiError';

class TLDService {
    async createTLD(data: Partial<ITLD>): Promise<ITLD> {
        const existing = await TLDModel.findOne({ tld: data.tld });
        if (existing) {
            throw new ApiError(400, 'TLD already exists');
        }
        return await TLDModel.create(data);
    }

    async getAllTLDs(query: any = {}): Promise<ITLD[]> {
        // Basic filter implementation
        const filter: any = {};
        if (query.status) filter.status = query.status;
        if (query.isSpotlight) filter.isSpotlight = query.isSpotlight === 'true';

        return await TLDModel.find(filter).sort({ serial: 1 });
    }

    async getTLDByExtension(extension: string): Promise<ITLD> {
        const tld = await TLDModel.findOne({ tld: extension.toLowerCase() });
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        return tld;
    }

    async getTLDById(id: string): Promise<ITLD> {
        const tld = await TLDModel.findById(id);
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        return tld;
    }

    async updateTLD(id: string, data: Partial<ITLD>): Promise<ITLD | null> {
        const tld = await TLDModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        return tld;
    }

    async deleteTLD(id: string): Promise<ITLD | null> {
        const tld = await TLDModel.findByIdAndDelete(id);
        if (!tld) {
            throw new ApiError(404, 'TLD not found');
        }
        return tld;
    }

    // Helper to find registrar for a TLD
    async getRegistrarForTLD(extension: string): Promise<string | null> {
        const tld = await TLDModel.findOne({ tld: extension.toLowerCase() });
        if (tld && tld.autoRegistration && tld.autoRegistration.enabled) {
            return tld.autoRegistration.provider;
        }
        return null;
    }
}

export default new TLDService();

import VpsServiceDetails, { IVpsServiceDetails } from '../models/vps-details.model';

export class VpsDetailsRepository {
    async create(data: Partial<IVpsServiceDetails>): Promise<IVpsServiceDetails> {
        return await VpsServiceDetails.create(data);
    }

    async findByServiceId(serviceId: string): Promise<IVpsServiceDetails | null> {
        return await VpsServiceDetails.findOne({ serviceId }).exec();
    }

    async updateByServiceId(serviceId: string, data: Partial<IVpsServiceDetails>): Promise<IVpsServiceDetails | null> {
        return await VpsServiceDetails.findOneAndUpdate(
            { serviceId },
            { $set: data },
            { new: true, runValidators: true }
        ).exec();
    }
}

export default new VpsDetailsRepository();

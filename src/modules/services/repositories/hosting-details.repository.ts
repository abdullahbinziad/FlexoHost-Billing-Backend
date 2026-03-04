import HostingServiceDetails, { IHostingServiceDetails } from '../models/hosting-details.model';

export class HostingDetailsRepository {
    async create(data: Partial<IHostingServiceDetails>): Promise<IHostingServiceDetails> {
        return await HostingServiceDetails.create(data);
    }

    async findByServiceId(serviceId: string): Promise<IHostingServiceDetails | null> {
        return await HostingServiceDetails.findOne({ serviceId }).exec();
    }

    async updateByServiceId(serviceId: string, data: Partial<IHostingServiceDetails>): Promise<IHostingServiceDetails | null> {
        return await HostingServiceDetails.findOneAndUpdate(
            { serviceId },
            { $set: data },
            { new: true, runValidators: true }
        ).exec();
    }
}

export default new HostingDetailsRepository();

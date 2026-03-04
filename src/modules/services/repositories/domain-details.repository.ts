import DomainServiceDetails, { IDomainServiceDetails } from '../models/domain-details.model';

export class DomainDetailsRepository {
    async create(data: Partial<IDomainServiceDetails>): Promise<IDomainServiceDetails> {
        return await DomainServiceDetails.create(data);
    }

    async findByServiceId(serviceId: string): Promise<IDomainServiceDetails | null> {
        return await DomainServiceDetails.findOne({ serviceId }).exec();
    }

    async updateByServiceId(serviceId: string, data: Partial<IDomainServiceDetails>): Promise<IDomainServiceDetails | null> {
        return await DomainServiceDetails.findOneAndUpdate(
            { serviceId },
            { $set: data },
            { new: true, runValidators: true }
        ).exec();
    }
}

export default new DomainDetailsRepository();

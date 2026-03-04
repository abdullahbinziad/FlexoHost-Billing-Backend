import LicenseServiceDetails, { ILicenseServiceDetails } from '../models/license-details.model';

export class LicenseDetailsRepository {
    async create(data: Partial<ILicenseServiceDetails>): Promise<ILicenseServiceDetails> {
        return await LicenseServiceDetails.create(data);
    }

    async findByServiceId(serviceId: string): Promise<ILicenseServiceDetails | null> {
        return await LicenseServiceDetails.findOne({ serviceId }).exec();
    }

    async updateByServiceId(serviceId: string, data: Partial<ILicenseServiceDetails>): Promise<ILicenseServiceDetails | null> {
        return await LicenseServiceDetails.findOneAndUpdate(
            { serviceId },
            { $set: data },
            { new: true, runValidators: true }
        ).exec();
    }
}

export default new LicenseDetailsRepository();

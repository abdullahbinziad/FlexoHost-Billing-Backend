import EmailServiceDetails, { IEmailServiceDetails } from '../models/email-details.model';

export class EmailDetailsRepository {
    async create(data: Partial<IEmailServiceDetails>): Promise<IEmailServiceDetails> {
        return await EmailServiceDetails.create(data);
    }

    async findByServiceId(serviceId: string): Promise<IEmailServiceDetails | null> {
        return await EmailServiceDetails.findOne({ serviceId }).exec();
    }

    async updateByServiceId(serviceId: string, data: Partial<IEmailServiceDetails>): Promise<IEmailServiceDetails | null> {
        return await EmailServiceDetails.findOneAndUpdate(
            { serviceId },
            { $set: data },
            { new: true, runValidators: true }
        ).exec();
    }
}

export default new EmailDetailsRepository();

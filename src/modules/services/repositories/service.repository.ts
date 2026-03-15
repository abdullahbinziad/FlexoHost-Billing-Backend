import { IService } from '../service.interface';
import Service from '../service.model';
import { ServiceType, ServiceStatus } from '../types/enums';
import { FilterQuery } from 'mongoose';

// Detail Models
import DomainServiceDetails from '../models/domain-details.model';
import HostingServiceDetails from '../models/hosting-details.model';
import VpsServiceDetails from '../models/vps-details.model';
import EmailServiceDetails from '../models/email-details.model';
import LicenseServiceDetails from '../models/license-details.model';

export class ServiceRepository {
    async create(data: Partial<IService>): Promise<IService> {
        return await Service.create(data);
    }

    async findById(id: string): Promise<IService | null> {
        return await Service.findById(id).exec();
    }

    async findByOrderItemId(orderItemId: string): Promise<IService | null> {
        return await Service.findOne({ orderItemId }).exec();
    }

    async updateById(id: string, data: Partial<IService>): Promise<IService | null> {
        return await Service.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true }
        ).exec();
    }

    async listByClientId(
        clientId: string,
        options: {
            type?: ServiceType;
            status?: ServiceStatus;
            page?: number;
            limit?: number;
            sortBy?: string;
            sortOrder?: 'asc' | 'desc';
            /** Grant filter: only these service IDs (grantee with specific_services). */
            serviceIds?: string[];
            /** Grant filter: only these service types (grantee with service_type). */
            types?: string[];
        } = {}
    ): Promise<{ services: IService[]; total: number; pages: number }> {
        const query: FilterQuery<IService> = { clientId };

        if (options.type) query.type = options.type;
        if (options.status) query.status = options.status;
        if (options.serviceIds?.length || options.types?.length) {
            const or: FilterQuery<IService>[] = [];
            if (options.serviceIds?.length) or.push({ _id: { $in: options.serviceIds } } as FilterQuery<IService>);
            if (options.types?.length) or.push({ type: { $in: options.types } } as FilterQuery<IService>);
            (query as any).$or = or;
        }

        const page = options.page || 1;
        const limit = options.limit || 10;
        const skip = (page - 1) * limit;

        const sort: Record<string, 1 | -1> = {};
        if (options.sortBy) {
            sort[options.sortBy] = options.sortOrder === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = -1; // Default
        }

        const [services, total] = await Promise.all([
            Service.find(query).sort(sort).skip(skip).limit(limit).exec(),
            Service.countDocuments(query).exec(),
        ]);

        return {
            services,
            total,
            pages: Math.ceil(total / limit),
        };
    }

    async updateStatus(
        id: string,
        newStatus: ServiceStatus,
        extraData: Partial<IService> = {}
    ): Promise<IService | null> {
        const updatePayload: any = { $set: { status: newStatus, ...extraData } };

        if (newStatus === ServiceStatus.SUSPENDED && !extraData.suspendedAt) {
            updatePayload.$set.suspendedAt = new Date();
        } else if (newStatus === ServiceStatus.TERMINATED && !extraData.terminatedAt) {
            updatePayload.$set.terminatedAt = new Date();
        }

        return await Service.findByIdAndUpdate(id, updatePayload, { new: true }).exec();
    }

    async findByIdWithDetails(id: string): Promise<{ service: IService; details: any } | null> {
        const service = await this.findById(id);
        if (!service) return null;

        let details = null;
        switch (service.type) {
            case ServiceType.DOMAIN:
                details = await DomainServiceDetails.findOne({ serviceId: service._id }).exec();
                break;
            case ServiceType.HOSTING:
                details = await HostingServiceDetails.findOne({ serviceId: service._id }).exec();
                break;
            case ServiceType.VPS:
                details = await VpsServiceDetails.findOne({ serviceId: service._id }).exec();
                break;
            case ServiceType.EMAIL:
                details = await EmailServiceDetails.findOne({ serviceId: service._id }).exec();
                break;
            case ServiceType.LICENSE:
                details = await LicenseServiceDetails.findOne({ serviceId: service._id }).exec();
                break;
        }

        return { service, details };
    }
}

export default new ServiceRepository();

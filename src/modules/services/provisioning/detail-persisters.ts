import mongoose from 'mongoose';
import { ServiceType } from '../types/enums';
import {
    domainDetailsRepository,
    hostingDetailsRepository,
    vpsDetailsRepository,
    emailDetailsRepository,
    licenseDetailsRepository,
} from '../repositories';

export type DetailPersister = (
    serviceId: mongoose.Types.ObjectId,
    details: Record<string, unknown>
) => Promise<void>;

/**
 * Persist type-specific detail record from provider result.
 * Each persister receives serviceId and the details payload returned by the provider.
 */
async function persistDomainDetails(
    serviceId: mongoose.Types.ObjectId,
    details: Record<string, unknown>
): Promise<void> {
    await domainDetailsRepository.create({
        serviceId,
        ...details,
    } as any);
}

async function persistHostingDetails(
    serviceId: mongoose.Types.ObjectId,
    details: Record<string, unknown>
): Promise<void> {
    await hostingDetailsRepository.create({
        serviceId,
        ...details,
    } as any);
}

async function persistVpsDetails(
    serviceId: mongoose.Types.ObjectId,
    details: Record<string, unknown>
): Promise<void> {
    await vpsDetailsRepository.create({
        serviceId,
        ...details,
    } as any);
}

async function persistEmailDetails(
    serviceId: mongoose.Types.ObjectId,
    details: Record<string, unknown>
): Promise<void> {
    await emailDetailsRepository.create({
        serviceId,
        ...details,
    } as any);
}

async function persistLicenseDetails(
    serviceId: mongoose.Types.ObjectId,
    details: Record<string, unknown>
): Promise<void> {
    await licenseDetailsRepository.create({
        serviceId,
        ...details,
    } as any);
}

const persisters: Partial<Record<ServiceType, DetailPersister>> = {
    [ServiceType.DOMAIN]: persistDomainDetails,
    [ServiceType.HOSTING]: persistHostingDetails,
    [ServiceType.VPS]: persistVpsDetails,
    [ServiceType.EMAIL]: persistEmailDetails,
    [ServiceType.LICENSE]: persistLicenseDetails,
};

/**
 * Get the detail persister for a service type.
 * Returns undefined if type has no detail model (future types can add one).
 */
export function getDetailPersister(serviceType: ServiceType): DetailPersister | undefined {
    return persisters[serviceType];
}

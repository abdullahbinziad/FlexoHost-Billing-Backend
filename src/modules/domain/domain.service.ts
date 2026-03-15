import { escapeRegex } from '../../utils/string.util';
import { IDomainRegistrationPayload, IDomainTransferPayload } from './domain.interface';
import tldService from './tld/tld.service';
import ApiError from '../../utils/apiError';
import { serviceRepository } from '../services/repositories';
import DomainServiceDetails from '../services/models/domain-details.model';
import Service from '../services/service.model';
import { ServiceType } from '../services/types/enums';
import { registrarAudit } from './registrar/registrar-audit';
import { domainRegistrarService } from './registrar/domain-registrar.service';
import type { DomainContactDetails, DnsRecord, RegistrarContact } from './registrar/registrar.types';
import { DomainTransferStatus, type IDomainContact } from '../services/models/domain-details.model';
import RegistrarDiscoveredDomain from './registrar/registrar-discovered-domain.model';
import { auditLogSafe } from '../activity-log/activity-log.service';

class DomainService {
    private readonly syncStaleMs = 24 * 60 * 60 * 1000;

    private async getStoredRegistrarName(domainName: string): Promise<string | null> {
        const normalized = (domainName || '').toLowerCase().trim();
        if (!normalized) return null;
        const details = await DomainServiceDetails.findOne({ domainName: normalized })
            .select('registrar')
            .lean();
        return (details as any)?.registrar ?? null;
    }

    async searchDomain(domain: string): Promise<any> {
        try {
            const parts = domain.split('.');
            if (parts.length < 2) {
                throw new ApiError(400, 'Invalid domain format');
            }
            const extension = `.${parts.slice(1).join('.')}`;
            const tldData = await tldService.getTLDByExtension(extension);
            if (!tldData) {
                throw new ApiError(404, 'TLD not supported');
            }
            const [searchResult] = await domainRegistrarService.checkAvailability([domain]);
            const registrar = domainRegistrarService.resolveRegistrarName(domain);
            registrarAudit({ event: 'domain.search.performed', domain, status: 'success' });
            const tldObj = tldData.toObject ? tldData.toObject() : { ...tldData };
            const { features, autoRegistration, ...cleanTldData } = tldObj;
            return {
                domain,
                extension,
                registrar,
                available: searchResult?.available ?? false,
                price: searchResult?.price,
                currency: searchResult?.currency,
                premium: searchResult?.premium ?? false,
                registrarResult: searchResult ?? { domain, available: false },
                dynadotResult: searchResult ?? { domain, available: false },
                tldData: cleanTldData,
            };
        } catch (error) {
            throw error;
        }
    }

    async registerDomain(payload: IDomainRegistrationPayload): Promise<any> {
        registrarAudit({ event: 'domain.register.requested', domain: payload.domain });
        try {
            const result = await domainRegistrarService.registerDomain({
                domain: payload.domain,
                years: payload.duration ?? 1,
                currency: 'USD',
            });
            registrarAudit({ event: 'domain.register.completed', domain: payload.domain, status: 'success' });
            return { ...result, message: 'Domain registration initiated' };
        } catch (e) {
            registrarAudit({ event: 'domain.register.failed', domain: payload.domain, status: 'failure' });
            throw e;
        }
    }

    async renewDomain(domain: string, duration: number): Promise<any> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.renewDomain({ domain, years: duration, currency: 'USD' }, registrarName);
        await this.syncStoredDomainDetails(domain, {
            expiresAt: result.expirationDate,
            lastRegistrarSyncAt: new Date(),
            registrar: result.registrar,
        });
        return { ...result, message: 'Domain renewal initiated', duration };
    }

    async transferDomain(payload: IDomainTransferPayload): Promise<any> {
        const result = await domainRegistrarService.transferDomain({
            domain: payload.domain,
            authCode: payload.authCode,
            currency: 'USD',
        });
        registrarAudit({ event: 'domain.transfer.requested', domain: payload.domain, status: 'pending' });
        return { ...result, message: 'Domain transfer initiated' };
    }

    async getDomainDetails(domainCode: string): Promise<any> {
        const registrarName = await this.getStoredRegistrarName(domainCode);
        const details = await domainRegistrarService.getDomainInformation(domainCode, registrarName);
        await this.syncStoredDomainDetails(domainCode, {
            expiresAt: details.expiryDate,
            nameservers: details.nameservers ?? [],
            registrarLock: details.locked,
            lastRegistrarSyncAt: new Date(),
            registrar: details.registrar,
        });
        return {
            domain: details.domain,
            status: details.status,
            expirationDate: details.expiryDate,
            nameservers: details.nameservers ?? [],
            locked: details.locked,
            registrar: details.registrar,
            autoRenew: /auto|yes/i.test(details.renewOption ?? ''),
        };
    }

    async updateNameservers(domain: string, nameservers: string[]): Promise<void> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.saveNameservers(domain, nameservers, registrarName);
        await this.syncStoredDomainDetails(domain, {
            nameservers: nameservers.map((ns) => ns.trim()).filter(Boolean),
            lastRegistrarSyncAt: new Date(),
            registrar: result.registrar,
        });
        registrarAudit({ event: 'domain.nameservers_updated', domain, status: 'success' });
    }

    async getRegistrarLock(domain: string): Promise<{ locked: boolean }> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.getRegistrarLock(domain, registrarName);
        await this.syncStoredDomainDetails(domain, {
            registrarLock: result.locked,
            lastRegistrarSyncAt: new Date(),
            registrar: result.registrar,
        });
        return { locked: result.locked };
    }

    async saveRegistrarLock(domain: string, locked: boolean): Promise<void> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.saveRegistrarLock(domain, locked, registrarName);
        await this.syncStoredDomainDetails(domain, {
            registrarLock: locked,
            lastRegistrarSyncAt: new Date(),
            registrar: result.registrar,
        });
    }

    async getContactDetails(domain: string): Promise<DomainContactDetails> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.getContactDetails(domain, registrarName);
        await this.syncStoredDomainDetails(domain, {
            contacts: {
                registrant: this.toStoredDomainContact(result.registrant),
                admin: this.toStoredDomainContact(result.admin),
                tech: this.toStoredDomainContact(result.tech),
                billing: this.toStoredDomainContact(result.billing),
            },
            lastRegistrarSyncAt: new Date(),
            registrar: result.registrar,
        });
        return {
            registrant: result.registrant,
            admin: result.admin,
            tech: result.tech,
            billing: result.billing,
        };
    }

    async saveContactDetails(domain: string, contacts: Partial<DomainContactDetails>): Promise<void> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.saveContactDetails(domain, contacts, registrarName);
        const existing = await DomainServiceDetails.findOne({ domainName: domain.toLowerCase().trim() })
            .select('contacts')
            .lean();
        await this.syncStoredDomainDetails(domain, {
            contacts: this.mergeStoredContacts((existing as any)?.contacts, contacts),
            lastRegistrarSyncAt: new Date(),
            registrar: result.registrar,
        });
        registrarAudit({ event: 'domain.contacts_updated', domain, status: 'success' });
    }

    async getDns(domain: string): Promise<DnsRecord[]> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.getDns(domain, registrarName);
        return result.records;
    }

    async saveDns(domain: string, records: DnsRecord[]): Promise<void> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.saveDns(domain, records, registrarName);
        await this.syncStoredDomainDetails(domain, {
            lastRegistrarSyncAt: new Date(),
            registrar: result.registrar,
            syncStatus: 'success',
            syncMessage: 'DNS updated',
        });
        registrarAudit({ event: 'domain.dns_updated', domain, status: 'success' });
    }

    async listAllDomainsAdmin(
        filter: {
            search?: string;
            registrar?: string;
            serviceStatus?: string;
            transferStatus?: string;
            syncState?: string;
            source?: string;
            page?: number;
            limit?: number;
            sortBy?: string;
            sortOrder?: 'asc' | 'desc';
        } = {}
    ): Promise<{ results: any[]; totalResults: number; page: number; limit: number; totalPages: number }> {
        const page = Math.max(Number(filter.page) || 1, 1);
        const limit = Math.min(Math.max(Number(filter.limit) || 20, 1), 100);
        const sortOrder = filter.sortOrder === 'asc' ? 1 : -1;
        const sortByMap: Record<string, string> = {
            domainName: 'domainName',
            clientName: 'clientName',
            registrar: 'registrar',
            serviceStatus: 'serviceStatus',
            expiresAt: 'expiresAt',
            lastRegistrarSyncAt: 'lastRegistrarSyncAt',
            serviceNumber: 'serviceNumber',
            createdAt: 'createdAt',
        };
        const sortField = sortByMap[filter.sortBy || 'domainName'] ?? 'domainName';

        const pipeline = this.buildAdminInventoryPipeline(filter);
        const [{ metadata = [], results = [] } = { metadata: [], results: [] }] = await DomainServiceDetails.aggregate([
            ...pipeline,
            {
                $facet: {
                    metadata: [{ $count: 'totalResults' }],
                    results: [
                        { $sort: { [sortField]: sortOrder, _id: -1 } },
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                    ],
                },
            },
        ]);

        const totalResults = metadata[0]?.totalResults ?? 0;
        const totalPages = totalResults > 0 ? Math.ceil(totalResults / limit) : 1;

        return {
            results: results.map((item: any) => ({
                ...item,
                syncState: this.deriveSyncState(item),
            })),
            totalResults,
            page,
            limit,
            totalPages,
        };
    }

    async syncDomainByServiceId(serviceId: string, actorId?: string): Promise<any> {
        const details = await DomainServiceDetails.findOne({ serviceId }).lean();
        if (!details) {
            throw ApiError.notFound('Domain service details not found');
        }

        const service = await Service.findById(serviceId).lean();
        if (!service || service.type !== ServiceType.DOMAIN) {
            throw ApiError.notFound('Domain service not found');
        }

        try {
            const liveInfo = await domainRegistrarService.syncDomain(details.domainName, details.registrar);
            let nextTransferStatus = details.transferStatus;

            if (details.operationType === 'TRANSFER' && details.transferStatus === 'PENDING') {
                try {
                    const transferInfo = await domainRegistrarService.getTransferStatus(details.domainName, details.registrar);
                    nextTransferStatus = transferInfo.status === 'COMPLETED'
                        ? DomainTransferStatus.COMPLETED
                        : transferInfo.status === 'REJECTED'
                            ? DomainTransferStatus.REJECTED
                            : transferInfo.status === 'CANCELLED'
                                ? DomainTransferStatus.CANCELLED
                                : details.transferStatus;
                } catch {
                    // Keep existing transfer status when live transfer sync fails independently.
                }
            }

            const syncedAt = new Date();
            await DomainServiceDetails.updateOne(
                { serviceId },
                {
                    $set: {
                        expiresAt: liveInfo.expiryDate,
                        nameservers: liveInfo.nameservers ?? [],
                        registrarLock: liveInfo.locked,
                        registrar: liveInfo.registrar,
                        registrarStatus: liveInfo.status,
                        transferStatus: nextTransferStatus,
                        lastRegistrarSyncAt: syncedAt,
                        syncStatus: 'success',
                        syncMessage: 'Synced successfully',
                    },
                }
            ).exec();

            await Service.updateOne(
                { _id: serviceId },
                {
                    $set: {
                        'provisioning.lastSyncedAt': syncedAt,
                        'provisioning.lastError': '',
                    },
                }
            ).exec();

            auditLogSafe({
                message: `Domain synced: ${details.domainName}`,
                type: 'domain_synced',
                category: 'domain',
                actorType: actorId ? 'user' : 'system',
                actorId,
                source: actorId ? 'manual' : 'system',
                status: 'success',
                clientId: (service.clientId as any)?.toString?.(),
                serviceId: serviceId,
                meta: {
                    domainName: details.domainName,
                    registrar: liveInfo.registrar,
                    registrarStatus: liveInfo.status,
                },
            });

            return {
                serviceId,
                domainName: details.domainName,
                registrar: liveInfo.registrar,
                registrarStatus: liveInfo.status,
                expiresAt: liveInfo.expiryDate,
                lastRegistrarSyncAt: syncedAt,
            };
        } catch (error: any) {
            const message = error?.message || 'Domain sync failed';
            await DomainServiceDetails.updateOne(
                { serviceId },
                {
                    $set: {
                        syncStatus: 'failure',
                        syncMessage: message,
                    },
                }
            ).exec();
            await Service.updateOne(
                { _id: serviceId },
                {
                    $set: {
                        'provisioning.lastError': message,
                    },
                }
            ).exec();

            auditLogSafe({
                message: `Domain sync failed: ${details.domainName}`,
                type: 'domain_synced',
                category: 'domain',
                actorType: actorId ? 'user' : 'system',
                actorId,
                source: actorId ? 'manual' : 'system',
                status: 'failure',
                severity: 'medium',
                clientId: (service.clientId as any)?.toString?.(),
                serviceId: serviceId,
                meta: {
                    domainName: details.domainName,
                    registrar: details.registrar,
                    error: message,
                },
            });

            throw error;
        }
    }

    async bulkSyncDomains(
        payload: {
            serviceIds?: string[];
            search?: string;
            registrar?: string;
            serviceStatus?: string;
            transferStatus?: string;
            syncState?: string;
            source?: string;
        },
        actorId?: string
    ): Promise<{ total: number; synced: number; failed: number; items: Array<{ serviceId: string; success: boolean; message?: string }> }> {
        let serviceIds = (payload.serviceIds ?? []).filter(Boolean);
        if (serviceIds.length === 0) {
            serviceIds = await this.findAdminInventoryServiceIds(payload);
        }
        serviceIds = serviceIds.slice(0, 100);

        const items: Array<{ serviceId: string; success: boolean; message?: string }> = [];
        let synced = 0;
        let failed = 0;

        for (const serviceId of serviceIds) {
            try {
                await this.syncDomainByServiceId(serviceId, actorId);
                items.push({ serviceId, success: true });
                synced++;
            } catch (error: any) {
                items.push({ serviceId, success: false, message: error?.message || 'Sync failed' });
                failed++;
            }
        }

        return {
            total: serviceIds.length,
            synced,
            failed,
            items,
        };
    }

    async reconcileRegistrarDomains(registrarKey: string): Promise<{
        registrar: string;
        totalDomains: number;
        knownCount: number;
        missingDomains: Array<{ domainName: string; registrar: string; alreadyImported: boolean }>;
    }> {
        const { registrar, domains } = await domainRegistrarService.listRegistrarDomains(registrarKey);
        const normalizedRegistrar = registrar.toLowerCase();
        const normalizedDomains = Array.from(
            new Set(
                domains
                    .map((entry) => String(entry.domain || '').trim().toLowerCase())
                    .filter(Boolean)
            )
        );

        const [knownDomains, importedDomains] = await Promise.all([
            DomainServiceDetails.find({
                domainName: { $in: normalizedDomains },
                registrar: normalizedRegistrar,
            }).select('domainName').lean(),
            RegistrarDiscoveredDomain.find({
                domainName: { $in: normalizedDomains },
                registrar: normalizedRegistrar,
            }).select('domainName').lean(),
        ]);

        const knownSet = new Set(knownDomains.map((item: any) => item.domainName));
        const importedSet = new Set(importedDomains.map((item: any) => item.domainName));

        const missingDomains = normalizedDomains
            .filter((domainName) => !knownSet.has(domainName))
            .map((domainName) => ({
                domainName,
                registrar: normalizedRegistrar,
                alreadyImported: importedSet.has(domainName),
            }));

        return {
            registrar: normalizedRegistrar,
            totalDomains: normalizedDomains.length,
            knownCount: knownSet.size,
            missingDomains,
        };
    }

    async importRegistrarDomains(
        registrarKey: string,
        domainNames: string[],
        actorId?: string
    ): Promise<{ registrar: string; importedCount: number; importedDomains: Array<{ domainName: string; status: string }> }> {
        const normalizedRegistrar = registrarKey.toLowerCase().trim();
        const uniqueDomains = Array.from(new Set(domainNames.map((item) => item.trim().toLowerCase()).filter(Boolean)));
        if (uniqueDomains.length === 0) {
            throw ApiError.badRequest('At least one domain is required to import');
        }

        const existingKnown = await DomainServiceDetails.find({
            domainName: { $in: uniqueDomains },
            registrar: normalizedRegistrar,
        }).select('domainName').lean();
        const existingKnownSet = new Set(existingKnown.map((item: any) => item.domainName));

        const importedDomains: Array<{ domainName: string; status: string }> = [];
        for (const domainName of uniqueDomains) {
            if (existingKnownSet.has(domainName)) {
                importedDomains.push({ domainName, status: 'already-tracked' });
                continue;
            }

            try {
                const liveInfo = await domainRegistrarService.syncDomain(domainName, normalizedRegistrar);
                await RegistrarDiscoveredDomain.findOneAndUpdate(
                    { domainName, registrar: normalizedRegistrar },
                    {
                        $set: {
                            domainName,
                            registrar: normalizedRegistrar,
                            registrarStatus: liveInfo.status,
                            expiresAt: liveInfo.expiryDate,
                            nameservers: liveInfo.nameservers ?? [],
                            registrarLock: liveInfo.locked,
                            syncStatus: 'success',
                            syncMessage: 'Imported from registrar reconciliation',
                            lastDetectedAt: new Date(),
                            importedAt: new Date(),
                            lastRegistrarSyncAt: new Date(),
                        },
                    },
                    { new: true, upsert: true }
                );

                auditLogSafe({
                    message: `Registrar domain imported for tracking: ${domainName}`,
                    type: 'domain_imported',
                    category: 'domain',
                    actorType: actorId ? 'user' : 'system',
                    actorId,
                    source: actorId ? 'manual' : 'system',
                    status: 'success',
                    meta: {
                        domainName,
                        registrar: normalizedRegistrar,
                        source: 'registrar_reconcile',
                    },
                });

                importedDomains.push({ domainName, status: 'imported' });
            } catch (error: any) {
                await RegistrarDiscoveredDomain.findOneAndUpdate(
                    { domainName, registrar: normalizedRegistrar },
                    {
                        $set: {
                            domainName,
                            registrar: normalizedRegistrar,
                            syncStatus: 'failure',
                            syncMessage: error?.message || 'Import failed',
                            lastDetectedAt: new Date(),
                        },
                    },
                    { new: true, upsert: true }
                );
                importedDomains.push({ domainName, status: 'failed' });
            }
        }

        return {
            registrar: normalizedRegistrar,
            importedCount: importedDomains.filter((item) => item.status === 'imported').length,
            importedDomains,
        };
    }

    /** List domains owned by a client (from Service + DomainServiceDetails). Excludes eppCodeEncrypted. */
    async listDomainsByClientId(
        clientId: string,
        options: { page?: number; limit?: number } = {}
    ): Promise<{ domains: any[]; total: number; page: number; limit: number; totalPages: number }> {
        const page = Math.max(Number(options.page) || 1, 1);
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const { services, total } = await serviceRepository.listByClientId(clientId, {
            type: ServiceType.DOMAIN,
            page,
            limit,
        });
        if (services.length === 0) {
            return { domains: [], total: 0, page, limit, totalPages: 0 };
        }
        const serviceIds = services.map((s: any) => s._id);
        const detailsList = await DomainServiceDetails.find({ serviceId: { $in: serviceIds } })
            .select('-eppCodeEncrypted')
            .lean();
        const detailsByServiceId = Object.fromEntries(
            detailsList.map((d: any) => [d.serviceId.toString(), d])
        );
        const domains = services.map((s: any) => {
            const details = detailsByServiceId[s._id.toString()];
            return {
                serviceId: s._id,
                serviceNumber: s.serviceNumber,
                status: s.status,
                domainName: details?.domainName,
                expiresAt: details?.expiresAt ?? s.nextDueDate,
                nameservers: details?.nameservers ?? [],
                registrarLock: details?.registrarLock,
                hasEppCode: details?.operationType === 'TRANSFER',
                ...(details ? { details } : {}),
            };
        });
        return {
            domains,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /** Resolve domain name to service + details if the domain belongs to the given client. Returns null if not found or not owned. */
    async getDomainServiceForClient(clientId: string, domainName: string): Promise<{ service: any; details: any } | null> {
        const normalized = (domainName || '').toLowerCase().trim();
        if (!normalized) return null;
        const details = await DomainServiceDetails.findOne({
            domainName: normalized,
        }).lean();
        if (!details) return null;
        const service = await Service.findById(details.serviceId).lean();
        if (!service || service.clientId.toString() !== clientId) return null;
        return { service, details };
    }

    /** Get live EPP/auth code for an owned domain; falls back to stored transfer auth code if live fetch is unavailable. */
    async getEppCodeForClient(clientId: string, domainName: string): Promise<string | null> {
        const owned = await this.getDomainServiceForClient(clientId, domainName);
        if (!owned) return null;

        try {
            const live = await domainRegistrarService.getEppCode(domainName, undefined, (owned.details as any)?.registrar);
            if (live.eppCode) {
                registrarAudit({ event: 'domain.epp_code_requested', domain: domainName, status: 'success' });
                return live.eppCode;
            }
        } catch {
            // Fall back to stored transfer auth code below.
        }

        const withEpp = await DomainServiceDetails.findOne({ serviceId: owned.service._id })
            .select('+eppCodeEncrypted')
            .lean();
        const enc = (withEpp as any)?.eppCodeEncrypted;
        if (!enc) return null;
        try {
            return Buffer.from(enc, 'base64').toString('utf8');
        } catch {
            return null;
        }
    }

    private buildAdminInventoryPipeline(filter: {
        search?: string;
        registrar?: string;
        serviceStatus?: string;
        transferStatus?: string;
        syncState?: string;
        source?: string;
    }): any[] {
        const pipeline: any[] = [
            {
                $lookup: {
                    from: 'services',
                    localField: 'serviceId',
                    foreignField: '_id',
                    as: 'service',
                },
            },
            { $unwind: '$service' },
            {
                $match: {
                    'service.type': ServiceType.DOMAIN,
                },
            },
            {
                $lookup: {
                    from: 'clients',
                    localField: 'service.clientId',
                    foreignField: '_id',
                    as: 'client',
                },
            },
            { $unwind: '$client' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'client.user',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            {
                $unwind: {
                    path: '$user',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $addFields: {
                    clientName: {
                        $trim: {
                            input: {
                                $concat: [
                                    { $ifNull: ['$client.firstName', ''] },
                                    ' ',
                                    { $ifNull: ['$client.lastName', ''] },
                                ],
                            },
                        },
                    },
                    clientCompanyName: '$client.companyName',
                    clientEmail: {
                        $ifNull: ['$client.contactEmail', '$user.email'],
                    },
                    clientNumber: '$client.clientId',
                    serviceNumber: '$service.serviceNumber',
                    serviceStatus: '$service.status',
                },
            },
        ];

        const matchClauses: any[] = [];
        if (filter.search) {
            const safeSearch = escapeRegex(filter.search.trim());
            const regex = new RegExp(safeSearch, 'i');
            matchClauses.push({
                $or: [
                    { domainName: regex },
                    { registrar: regex },
                    { registrarStatus: regex },
                    { serviceNumber: regex },
                    { clientName: regex },
                    { clientCompanyName: regex },
                    { clientEmail: regex },
                ],
            });
        }
        if (filter.registrar) {
            matchClauses.push({ registrar: new RegExp(`^${escapeRegex(filter.registrar.trim())}$`, 'i') });
        }
        if (filter.serviceStatus) {
            matchClauses.push({ 'service.status': filter.serviceStatus.trim().toUpperCase() });
        }
        if (filter.transferStatus) {
            matchClauses.push({ transferStatus: filter.transferStatus.trim().toUpperCase() });
        }
        if (filter.source) {
            matchClauses.push({ source: filter.source });
        }
        const staleThreshold = new Date(Date.now() - this.syncStaleMs);
        if (filter.syncState === 'failed') {
            matchClauses.push({ syncStatus: 'failure' });
        } else if (filter.syncState === 'never') {
            matchClauses.push({
                $and: [
                    { $or: [{ lastRegistrarSyncAt: { $exists: false } }, { lastRegistrarSyncAt: null }] },
                    { syncStatus: { $ne: 'failure' } },
                ],
            });
        } else if (filter.syncState === 'stale') {
            matchClauses.push({
                syncStatus: { $ne: 'failure' },
                lastRegistrarSyncAt: { $lt: staleThreshold },
            });
        } else if (filter.syncState === 'fresh') {
            matchClauses.push({
                syncStatus: { $ne: 'failure' },
                lastRegistrarSyncAt: { $gte: staleThreshold },
            });
        }

        if (matchClauses.length > 0) {
            pipeline.push({ $match: { $and: matchClauses } });
        }

        pipeline.push({
            $project: {
                _id: 1,
                serviceId: '$service._id',
                clientId: '$client._id',
                clientNumber: 1,
                clientName: 1,
                clientCompanyName: 1,
                clientEmail: 1,
                serviceNumber: 1,
                serviceStatus: 1,
                domainName: 1,
                registrar: 1,
                registrarStatus: 1,
                transferStatus: 1,
                nameservers: 1,
                registrarLock: 1,
                expiresAt: 1,
                registeredAt: 1,
                lastRegistrarSyncAt: 1,
                syncStatus: 1,
                syncMessage: 1,
                source: 1,
                createdAt: 1,
            },
        });

        return pipeline;
    }

    private async findAdminInventoryServiceIds(filter: {
        search?: string;
        registrar?: string;
        serviceStatus?: string;
        transferStatus?: string;
        syncState?: string;
        source?: string;
    }): Promise<string[]> {
        const results = await DomainServiceDetails.aggregate([
            ...this.buildAdminInventoryPipeline(filter),
            { $project: { serviceId: 1 } },
            { $limit: 100 },
        ]);

        return results
            .map((item: any) => item.serviceId?.toString?.())
            .filter(Boolean);
    }

    private deriveSyncState(item: { syncStatus?: string; lastRegistrarSyncAt?: string | Date | null }): string {
        if (item.syncStatus === 'failure') {
            return 'failed';
        }
        if (!item.lastRegistrarSyncAt) {
            return 'never';
        }
        const syncDate = new Date(item.lastRegistrarSyncAt);
        if (Number.isNaN(syncDate.getTime())) {
            return 'never';
        }
        return Date.now() - syncDate.getTime() > this.syncStaleMs ? 'stale' : 'fresh';
    }

    private async syncStoredDomainDetails(
        domainName: string,
        updates: Partial<{
            expiresAt: Date;
            nameservers: string[];
            registrarLock: boolean;
            lastRegistrarSyncAt: Date;
            registrar: string;
            registrarStatus: string;
            syncStatus: 'success' | 'failure' | 'pending';
            syncMessage: string;
            source: 'billing' | 'registrar_import';
            contacts: {
                registrant: IDomainContact;
                admin: IDomainContact;
                tech: IDomainContact;
                billing: IDomainContact;
            };
        }>
    ): Promise<void> {
        const normalized = domainName.toLowerCase().trim();
        if (!normalized) return;
        await DomainServiceDetails.updateOne(
            { domainName: normalized },
            { $set: updates }
        ).exec();
    }

    private toStoredDomainContact(contact?: RegistrarContact): IDomainContact {
        const fullName = (contact?.name || '').trim();
        const [firstName = '', ...rest] = fullName ? fullName.split(/\s+/) : [''];
        const lastName = rest.join(' ');
        const phone = [contact?.phonecc, contact?.phonenum].filter(Boolean).join(' ').trim();
        return {
            firstName: firstName || 'Unknown',
            lastName: lastName || 'Unknown',
            email: contact?.email || 'unknown@example.com',
            phone: phone || 'Unknown',
            address1: contact?.address1 || 'Unknown',
            city: contact?.city || 'Unknown',
            state: contact?.state || 'Unknown',
            postcode: contact?.zip || 'Unknown',
            country: contact?.country || 'US',
        };
    }

    private mergeStoredContacts(
        existing: {
            registrant?: IDomainContact;
            admin?: IDomainContact;
            tech?: IDomainContact;
            billing?: IDomainContact;
        } | undefined,
        incoming: Partial<DomainContactDetails>
    ): {
        registrant: IDomainContact;
        admin: IDomainContact;
        tech: IDomainContact;
        billing: IDomainContact;
    } {
        const fallback = (value?: IDomainContact): IDomainContact => value ?? {
            firstName: 'Unknown',
            lastName: 'Unknown',
            email: 'unknown@example.com',
            phone: 'Unknown',
            address1: 'Unknown',
            city: 'Unknown',
            state: 'Unknown',
            postcode: 'Unknown',
            country: 'US',
        };

        return {
            registrant: incoming.registrant ? this.toStoredDomainContact(incoming.registrant) : fallback(existing?.registrant),
            admin: incoming.admin ? this.toStoredDomainContact(incoming.admin) : fallback(existing?.admin),
            tech: incoming.tech ? this.toStoredDomainContact(incoming.tech) : fallback(existing?.tech),
            billing: incoming.billing ? this.toStoredDomainContact(incoming.billing) : fallback(existing?.billing),
        };
    }
}

export default new DomainService();

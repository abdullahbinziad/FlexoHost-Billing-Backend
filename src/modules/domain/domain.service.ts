import { escapeRegex } from '../../utils/string.util';
import { IDomainBulkRegistrationPayload, IDomainRegistrationPayload, IDomainTransferPayload } from './domain.interface';
import registrarRoutingService from './registrar/registrar-routing.service';
import ApiError from '../../utils/apiError';
import { serviceRepository } from '../services/repositories';
import DomainServiceDetails from '../services/models/domain-details.model';
import Service from '../services/service.model';
import { ServiceType } from '../services/types/enums';
import { registrarAudit } from './registrar/registrar-audit';
import { domainRegistrarService } from './registrar/domain-registrar.service';
import type { DomainAvailabilityResult, DomainContactDetails, DnsRecord, RegistrarContact } from './registrar/registrar.types';
import type { RegistrarRoutingSource } from './registrar/registrar-routing.service';
import { DomainTransferStatus, type IDomainContact } from '../services/models/domain-details.model';
import RegistrarDiscoveredDomain from './registrar/registrar-discovered-domain.model';
import { auditLogSafe } from '../activity-log/activity-log.service';
import OrderItem from '../order/order-item.model';
import { resolveDomainFqdnFromDetailsAndOrderItem, normalizeDomainFqdn } from './utils/domain-display';

const DOMAIN_IMPORT_RESULT_STATUS = {
    ALREADY_TRACKED: 'already-tracked',
    IMPORTED: 'imported',
    FAILED: 'failed',
} as const;

class DomainService {
    private readonly syncStaleMs = 24 * 60 * 60 * 1000;

    private async getStoredRegistrarName(domainName: string): Promise<string | null> {
        const normalized = normalizeDomainFqdn(domainName);
        if (!normalized) return null;
        const details = await DomainServiceDetails.findOne({
            $expr: { $eq: [{ $toLower: '$domainName' }, normalized] },
        })
            .select('registrar')
            .lean();
        return (details as any)?.registrar ?? null;
    }

    async searchDomain(domain: string): Promise<any> {
        try {
            const { registrarKey, extension, tld: tldData } = await registrarRoutingService.resolveRegistrarKeyForDomainName(domain);
            const [searchResult] = await domainRegistrarService.checkAvailability([domain], [registrarKey]);
            const registrar = domainRegistrarService.resolveRegistrarName(domain, registrarKey);
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
                tldData: cleanTldData,
            };
        } catch (error) {
            throw error;
        }
    }

    /** Multi-domain availability; one registrar per domain from TLD routing (up to 100 domains). */
    async searchDomains(domains: string[]): Promise<{
        results: Array<{
            domain: string;
            extension: string;
            registrar: string;
            available: boolean;
            price?: number;
            currency?: string;
            premium: boolean;
            registrarResult: DomainAvailabilityResult;
            routingSource: RegistrarRoutingSource;
            tldData: Record<string, unknown>;
        }>;
    }> {
        const raw = (domains || []).map((d) => d.trim().toLowerCase()).filter(Boolean);
        const unique = [...new Set(raw)];
        if (unique.length === 0) {
            throw ApiError.badRequest('At least one domain is required');
        }
        if (unique.length > 100) {
            throw ApiError.badRequest('Maximum 100 domains per bulk search');
        }

        const resolved = await registrarRoutingService.resolveRegistrarKeysForDomainNames(unique);
        const preferredRegistrars = resolved.map((r) => r.registrarKey);
        const availability = await domainRegistrarService.checkAvailability(unique, preferredRegistrars);

        const results = unique.map((domain, i) => {
            const r = resolved[i];
            const ar = availability[i];
            const tldObj = r.tld.toObject ? r.tld.toObject() : { ...r.tld };
            const { features: _feat, autoRegistration: _ar, ...cleanTldData } = tldObj as Record<string, unknown>;
            return {
                domain,
                extension: r.extension,
                registrar: domainRegistrarService.resolveRegistrarName(domain, r.registrarKey),
                available: ar?.available ?? false,
                price: ar?.price,
                currency: ar?.currency,
                premium: ar?.premium ?? false,
                registrarResult: ar ?? { domain, available: false },
                routingSource: r.source,
                tldData: cleanTldData as Record<string, unknown>,
            };
        });

        for (const d of unique) {
            registrarAudit({ event: 'domain.search.performed', domain: d, status: 'success' });
        }

        return { results };
    }

    async registerDomain(payload: IDomainRegistrationPayload): Promise<any> {
        registrarAudit({ event: 'domain.register.requested', domain: payload.domain });
        try {
            const { registrarKey } = await registrarRoutingService.resolveRegistrarKeyForDomainName(payload.domain);
            const result = await domainRegistrarService.registerDomain(
                {
                    domain: payload.domain,
                    years: payload.duration ?? 1,
                    currency: 'USD',
                    purpose: payload.purpose,
                    customerId: payload.customerId,
                    nameservers: payload.nameservers,
                    namelyRegistrant: payload.namelyRegistrant,
                },
                registrarKey
            );
            registrarAudit({ event: 'domain.register.completed', domain: payload.domain, status: 'success' });
            return { ...result, message: 'Domain registration initiated' };
        } catch (e) {
            registrarAudit({ event: 'domain.register.failed', domain: payload.domain, status: 'failure' });
            throw e;
        }
    }

    /** Staff direct bulk register: routes each domain via TLD; uses Dynadot `bulk_register` when applicable. */
    async registerDomainsBulk(payload: IDomainBulkRegistrationPayload): Promise<{
        results: Array<{
            domain: string;
            success: boolean;
            registrar: string;
            remoteId: string;
            orderId?: string;
            expirationDate?: Date;
            message?: string;
        }>;
        message: string;
    }> {
        const items = (payload.domains || []).slice(0, 100);
        if (items.length === 0) {
            throw ApiError.badRequest('At least one domain is required');
        }

        const preferredRegistrars: string[] = [];
        for (const item of items) {
            const { registrarKey } = await registrarRoutingService.resolveRegistrarKeyForDomainName(item.domain);
            preferredRegistrars.push(registrarKey);
        }

        const rows = await domainRegistrarService.registerDomainsBulk(
            items.map((d) => ({
                domain: d.domain,
                years: d.duration ?? 1,
                currency: 'USD',
            })),
            preferredRegistrars
        );

        for (const row of rows) {
            if (row.success) {
                registrarAudit({ event: 'domain.register.completed', domain: row.domain, status: 'success' });
            } else {
                registrarAudit({
                    event: 'domain.register.failed',
                    domain: row.domain,
                    status: 'failure',
                    meta: row.message ? { message: row.message } : undefined,
                });
            }
        }

        return {
            results: rows,
            message: 'Bulk domain registration processed',
        };
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
        const { registrarKey } = await registrarRoutingService.resolveRegistrarKeyForDomainName(payload.domain);
        const result = await domainRegistrarService.transferDomain(
            {
                domain: payload.domain,
                authCode: payload.authCode,
                currency: 'USD',
            },
            registrarKey
        );
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
        const existing = await DomainServiceDetails.findOne({
            $expr: { $eq: [{ $toLower: '$domainName' }, domain.toLowerCase().trim()] },
        })
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

        const withSync = results.map((item: any) => ({
            ...item,
            syncState: this.deriveSyncState(item),
        }));
        const enriched = await this.enrichAdminInventoryWithOrderFqdn(withSync);

        return {
            results: enriched,
            totalResults,
            page,
            limit,
            totalPages,
        };
    }

    /** Fill missing inventory domain names from order item config (same resolver as client domain list). */
    private async enrichAdminInventoryWithOrderFqdn(results: any[]): Promise<any[]> {
        if (!results?.length) return results;
        const orderItemIds = results.map((r) => r.orderItemId).filter(Boolean);
        if (!orderItemIds.length) {
            return results.map(({ orderItemId: _oid, ...rest }) => rest);
        }
        const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } })
            .select('configSnapshot nameSnapshot')
            .lean();
        const byId = Object.fromEntries(orderItems.map((o: any) => [o._id.toString(), o]));
        return results.map((row) => {
            const oi = byId[(row.orderItemId as any)?.toString?.()];
            const resolved = resolveDomainFqdnFromDetailsAndOrderItem(row, oi);
            const domainName =
                (resolved || normalizeDomainFqdn(row.domainName) || '').trim() || row.domainName;
            const { orderItemId: _oid, ...rest } = row;
            return { ...rest, domainName };
        });
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

        const orderItem = await OrderItem.findById(service.orderItemId).select('configSnapshot nameSnapshot').lean();
        const fqdn =
            resolveDomainFqdnFromDetailsAndOrderItem(details, orderItem) ||
            normalizeDomainFqdn((details as any)?.domainName);
        if (!fqdn) {
            throw ApiError.badRequest('Domain name could not be resolved for sync.');
        }
        if (normalizeDomainFqdn((details as any)?.domainName) !== fqdn) {
            await DomainServiceDetails.updateOne({ serviceId }, { $set: { domainName: fqdn } }).exec();
            (details as any).domainName = fqdn;
        }

        try {
            const liveInfo = await domainRegistrarService.syncDomain(fqdn, details.registrar);
            let nextTransferStatus = details.transferStatus;

            if (details.operationType === 'TRANSFER' && details.transferStatus === 'PENDING') {
                try {
                    const transferInfo = await domainRegistrarService.getTransferStatus(fqdn, details.registrar);
                    nextTransferStatus = transferInfo.status === DomainTransferStatus.COMPLETED
                        ? DomainTransferStatus.COMPLETED
                        : transferInfo.status === DomainTransferStatus.REJECTED
                            ? DomainTransferStatus.REJECTED
                            : transferInfo.status === DomainTransferStatus.CANCELLED
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
                message: `Domain synced: ${fqdn}`,
                type: 'domain_synced',
                category: 'domain',
                actorType: actorId ? 'user' : 'system',
                actorId,
                source: actorId ? 'manual' : 'system',
                status: 'success',
                clientId: (service.clientId as any)?.toString?.(),
                serviceId: serviceId,
                meta: {
                    domainName: fqdn,
                    registrar: liveInfo.registrar,
                    registrarStatus: liveInfo.status,
                },
            });

            return {
                serviceId,
                domainName: fqdn,
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
                message: `Domain sync failed: ${fqdn}`,
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
                    domainName: fqdn,
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
                $expr: {
                    $and: [
                        { $in: [{ $toLower: '$domainName' }, normalizedDomains] },
                        { $eq: [{ $toLower: { $ifNull: ['$registrar', ''] } }, normalizedRegistrar] },
                    ],
                },
            }).select('domainName').lean(),
            RegistrarDiscoveredDomain.find({
                $expr: {
                    $and: [
                        { $in: [{ $toLower: '$domainName' }, normalizedDomains] },
                        { $eq: [{ $toLower: { $ifNull: ['$registrar', ''] } }, normalizedRegistrar] },
                    ],
                },
            }).select('domainName').lean(),
        ]);

        const knownSet = new Set(
            knownDomains.map((item: any) => String(item.domainName || '').trim().toLowerCase()).filter(Boolean)
        );
        const importedSet = new Set(
            importedDomains.map((item: any) => String(item.domainName || '').trim().toLowerCase()).filter(Boolean)
        );

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
            $expr: {
                $and: [
                    { $in: [{ $toLower: '$domainName' }, uniqueDomains] },
                    { $eq: [{ $toLower: { $ifNull: ['$registrar', ''] } }, normalizedRegistrar] },
                ],
            },
        }).select('domainName').lean();
        const existingKnownSet = new Set(
            existingKnown.map((item: any) => String(item.domainName || '').trim().toLowerCase()).filter(Boolean)
        );

        const importedDomains: Array<{ domainName: string; status: string }> = [];
        for (const domainName of uniqueDomains) {
            if (existingKnownSet.has(domainName)) {
                importedDomains.push({ domainName, status: DOMAIN_IMPORT_RESULT_STATUS.ALREADY_TRACKED });
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

                importedDomains.push({ domainName, status: DOMAIN_IMPORT_RESULT_STATUS.IMPORTED });
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
                importedDomains.push({ domainName, status: DOMAIN_IMPORT_RESULT_STATUS.FAILED });
            }
        }

        return {
            registrar: normalizedRegistrar,
            importedCount: importedDomains.filter((item) => item.status === DOMAIN_IMPORT_RESULT_STATUS.IMPORTED).length,
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
        const orderItemIds = services.map((s: any) => s.orderItemId).filter(Boolean);
        const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } })
            .select('configSnapshot nameSnapshot')
            .lean();
        const orderItemById = Object.fromEntries(orderItems.map((o: any) => [o._id.toString(), o]));

        const detailsList = await DomainServiceDetails.find({ serviceId: { $in: serviceIds } })
            .select('-eppCodeEncrypted')
            .lean();
        const detailsByServiceId = Object.fromEntries(
            detailsList.map((d: any) => [d.serviceId.toString(), d])
        );
        const domains = services.map((s: any) => {
            const details = detailsByServiceId[s._id.toString()];
            const oi = orderItemById[(s.orderItemId as any)?.toString?.() || String(s.orderItemId)];
            const resolvedFqdn = resolveDomainFqdnFromDetailsAndOrderItem(details, oi);
            const domainName = resolvedFqdn || normalizeDomainFqdn(details?.domainName) || '';
            const cfg = (oi?.configSnapshot || {}) as Record<string, unknown>;
            const registrarFromOrder = String(cfg.registrar || '').trim();
            const mergedDetails =
                details || domainName
                    ? {
                          ...(details || {}),
                          domainName: domainName || (details as any)?.domainName,
                      }
                    : undefined;
            return {
                serviceId: s._id,
                serviceNumber: s.serviceNumber,
                status: s.status,
                domainName,
                registrar: (details as any)?.registrar || registrarFromOrder || undefined,
                expiresAt: details?.expiresAt ?? s.nextDueDate,
                nameservers: details?.nameservers ?? [],
                registrarLock: details?.registrarLock,
                hasEppCode: details?.operationType === 'TRANSFER',
                ...(mergedDetails ? { details: mergedDetails } : {}),
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
        const normalized = normalizeDomainFqdn(domainName);
        if (!normalized) return null;
        const details = await DomainServiceDetails.findOne({
            $expr: { $eq: [{ $toLower: '$domainName' }, normalized] },
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

        const apiDomain =
            normalizeDomainFqdn((owned.details as any)?.domainName) || normalizeDomainFqdn(domainName) || domainName;
        try {
            const live = await domainRegistrarService.getEppCode(apiDomain, undefined, (owned.details as any)?.registrar);
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
            {
                $lookup: {
                    from: OrderItem.collection.collectionName,
                    localField: 'service.orderItemId',
                    foreignField: '_id',
                    as: '_oiInv',
                },
            },
            { $unwind: { path: '$_oiInv', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    _inventorySearchDomain: {
                        $let: {
                            vars: {
                                fromDetails: { $toLower: { $trim: { input: { $ifNull: ['$domainName', ''] } } } },
                                fromOrder: {
                                    $toLower: {
                                        $trim: {
                                            input: {
                                                $ifNull: [
                                                    '$_oiInv.configSnapshot.domainName',
                                                    { $ifNull: ['$_oiInv.configSnapshot.domain', ''] },
                                                ],
                                            },
                                        },
                                    },
                                },
                            },
                            in: {
                                $cond: [
                                    { $gt: [{ $strLenCP: '$$fromDetails' }, 0] },
                                    '$$fromDetails',
                                    '$$fromOrder',
                                ],
                            },
                        },
                    },
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
                    { _inventorySearchDomain: regex },
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
                orderItemId: '$service.orderItemId',
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
            { $expr: { $eq: [{ $toLower: '$domainName' }, normalized] } },
            { $set: { ...updates, domainName: normalized } }
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

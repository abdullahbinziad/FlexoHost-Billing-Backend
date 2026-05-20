import { escapeRegex } from '../../utils/string.util';
import { IDomainBulkRegistrationPayload, IDomainRegistrationPayload, IDomainTransferPayload } from './domain.interface';
import registrarRoutingService from './registrar/registrar-routing.service';
import ApiError from '../../utils/apiError';
import { serviceRepository } from '../services/repositories';
import DomainServiceDetails, {
    DOMAIN_LIFECYCLE_STATUS_OPTIONS,
    DomainLifecycleStatus,
    DomainOperationType,
} from '../services/models/domain-details.model';
import Service from '../services/service.model';
import { BillingCycle, ServiceStatus, ServiceType, normalizeBillingCycle, normalizeServiceStatus } from '../services/types/enums';
import { registrarAudit } from './registrar/registrar-audit';
import { domainRegistrarService } from './registrar/domain-registrar.service';
import type { DomainAvailabilityResult, DomainContactDetails, DomainInformation, DnsRecord, RegistrarContact } from './registrar/registrar.types';
import type { RegistrarRoutingSource } from './registrar/registrar-routing.service';
import { DomainTransferStatus, type IDomainContact } from '../services/models/domain-details.model';
import RegistrarDiscoveredDomain from './registrar/registrar-discovered-domain.model';
import { auditLogSafe } from '../activity-log/activity-log.service';
import OrderItem from '../order/order-item.model';
import { resolveDomainFqdnFromDetailsAndOrderItem, normalizeDomainFqdn } from './utils/domain-display';
import Client from '../client/client.model';
import Order from '../order/order.model';
import { DomainActionType } from '../order/order-item.interface';
import { OrderStatus } from '../order/order.interface';
import { DEFAULT_CURRENCY } from '../../config/currency.config';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import { getEffectiveDefaultNameserversForProvision } from './domain-system-settings.service';
import invoiceService from '../invoice/invoice.service';
import Invoice from '../invoice/invoice.model';
import { InvoiceItemType, InvoiceStatus } from '../invoice/invoice.interface';
import RenewalLedger from '../services/models/renewal-ledger.model';
import { addBillingCycleToDate } from '../services/utils/billing-cycle.util';
import tldService from './tld/tld.service';

const DOMAIN_IMPORT_RESULT_STATUS = {
    ALREADY_TRACKED: 'already-tracked',
    IMPORTED: 'imported',
    FAILED: 'failed',
} as const;

const RECOVERABLE_DOMAIN_ERROR_PATTERN = /(already|exist|registered|unavailable|not available|taken|in account|owned)/i;

type DomainRecoveryPriceSnapshot = {
    setup?: number;
    recurring?: number;
    discount?: number;
    tax?: number;
    total?: number;
    currency?: string;
};

class DomainService {
    private readonly syncStaleMs = 24 * 60 * 60 * 1000;

    isRecoverableDomainProvisioningError(message: string): boolean {
        return RECOVERABLE_DOMAIN_ERROR_PATTERN.test(message || '');
    }

    getDomainStatusOptions() {
        return {
            lifecycleStatuses: DOMAIN_LIFECYCLE_STATUS_OPTIONS,
            transferStatuses: Object.values(DomainTransferStatus),
            serviceStatuses: Object.values(ServiceStatus),
        };
    }

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

    async createDomainRenewalInvoice(params: {
        clientId: string;
        domain: string;
        duration?: number;
    }): Promise<{
        invoiceId: string;
        invoiceNumber: string;
        status: InvoiceStatus;
        dueDate: Date;
        reusedExisting: boolean;
    }> {
        const owned = await this.getDomainServiceForClient(params.clientId, params.domain);
        if (!owned) throw ApiError.notFound('Domain not found for this client');

        const service = await Service.findById(owned.service._id).exec();
        if (!service) throw ApiError.notFound('Domain service not found');
        if (service.type !== ServiceType.DOMAIN) throw ApiError.badRequest('Service is not a domain service');
        if ([ServiceStatus.TERMINATED, ServiceStatus.CANCELLED].includes(service.status as ServiceStatus)) {
            throw ApiError.badRequest(`Cannot renew a ${service.status.toLowerCase()} domain service`);
        }
        if (service.billingCycle === BillingCycle.ONE_TIME) {
            throw ApiError.badRequest('One-time domain services cannot be renewed automatically');
        }

        const years = this.yearsFromBillingCycle(service.billingCycle as BillingCycle);
        if (params.duration && Number(params.duration) !== years) {
            throw ApiError.badRequest(`This domain service renews for ${years} year(s) based on its billing cycle`);
        }

        const currentDueDate = service.nextDueDate;
        const existingLedger = await RenewalLedger.findOne({
            serviceId: service._id,
            dueDate: currentDueDate,
        }).exec();
        if (existingLedger?.invoiceId) {
            const existingInvoice = await Invoice.findById(existingLedger.invoiceId).lean();
            if (existingInvoice && existingInvoice.status !== InvoiceStatus.CANCELLED) {
                return {
                    invoiceId: existingInvoice._id.toString(),
                    invoiceNumber: existingInvoice.invoiceNumber,
                    status: existingInvoice.status as InvoiceStatus,
                    dueDate: existingInvoice.dueDate,
                    reusedExisting: true,
                };
            }
        }

        const client = await Client.findById(service.clientId).lean();
        if (!client) throw ApiError.notFound('Client not found');

        const domainName = normalizeDomainFqdn((owned.details as any)?.domainName) || normalizeDomainFqdn(params.domain) || params.domain;
        const renewalPeriodEnd = addBillingCycleToDate(currentDueDate, service.billingCycle as BillingCycle);
        const currency = service.currency || DEFAULT_CURRENCY;
        const amount = await this.resolveDomainRenewalAmount(domainName, currency, years, Number(service.priceSnapshot?.recurring || 0));

        const invoice = await invoiceService.createInvoice({
            clientId: service.clientId,
            currency,
            dueDate: currentDueDate,
            billedTo: {
                companyName: (client as any).companyName || '',
                customerName: `${(client as any).firstName || ''} ${(client as any).lastName || ''}`.trim() || 'Client',
                address: (client as any).address?.street || 'N/A',
                country: (client as any).address?.country || 'N/A',
            },
            items: [
                {
                    type: InvoiceItemType.DOMAIN,
                    description: `DOMAIN Renewal - ${domainName} (${service.billingCycle})`,
                    amount,
                    period: {
                        startDate: currentDueDate,
                        endDate: renewalPeriodEnd,
                    },
                    meta: {
                        serviceId: service._id,
                        orderItemId: service.orderItemId,
                        source: 'domain_renewal_request',
                        serviceType: ServiceType.DOMAIN,
                        domainName,
                        billingCycle: service.billingCycle,
                        renewalYears: years,
                        renewalDueDate: currentDueDate,
                        renewalPeriodStart: currentDueDate,
                        renewalPeriodEnd,
                    },
                },
            ],
        });

        if (existingLedger) {
            existingLedger.invoiceId = invoice._id as any;
            existingLedger.paidAt = undefined;
            existingLedger.paidInvoiceId = undefined;
            await existingLedger.save();
        } else {
            try {
                await RenewalLedger.create({
                    serviceId: service._id,
                    dueDate: currentDueDate,
                    invoiceId: invoice._id,
                });
            } catch (err: any) {
                if (err?.code === 11000) {
                    const ledger = await RenewalLedger.findOne({ serviceId: service._id, dueDate: currentDueDate }).lean();
                    if (ledger?.invoiceId) {
                        const existingInvoice = await Invoice.findById(ledger.invoiceId).lean();
                        if (existingInvoice) {
                            return {
                                invoiceId: existingInvoice._id.toString(),
                                invoiceNumber: existingInvoice.invoiceNumber,
                                status: existingInvoice.status as InvoiceStatus,
                                dueDate: existingInvoice.dueDate,
                                reusedExisting: true,
                            };
                        }
                    }
                }
                throw err;
            }
        }

        auditLogSafe({
            message: `Domain renewal invoice ${invoice.invoiceNumber} created for ${domainName}`,
            type: 'invoice_auto_generated',
            category: 'invoice',
            actorType: 'system',
            source: 'manual',
            clientId: service.clientId.toString(),
            serviceId: service._id.toString(),
            invoiceId: invoice._id.toString(),
            meta: { domainName, renewalDueDate: currentDueDate },
        });

        return {
            invoiceId: invoice._id.toString(),
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            dueDate: invoice.dueDate,
            reusedExisting: false,
        };
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
        const details = await this.getStoredDomainDetailsByName(domainCode);
        if (!details) {
            throw ApiError.notFound('Domain details not found. Sync the domain from registrar first.');
        }
        return {
            domain: details.domainName,
            status: details.registrarStatus || details.lifecycleStatus || '',
            expirationDate: details.expiresAt,
            nameservers: details.nameservers ?? [],
            locked: details.registrarLock,
            registrar: details.registrar,
            lifecycleStatus: details.lifecycleStatus,
            lifecycleReason: details.lifecycleReason,
            syncStatus: details.syncStatus,
            syncMessage: details.syncMessage,
            lastRegistrarSyncAt: details.lastRegistrarSyncAt,
            autoRenew: true,
        };
    }

    async getAdminDomainServiceSnapshot(serviceId: string, clientId?: string): Promise<any> {
        const service = await Service.findById(serviceId).lean<any>();
        if (!service || service.type !== ServiceType.DOMAIN) {
            throw ApiError.notFound('Domain service not found');
        }
        if (clientId && service.clientId?.toString?.() !== clientId) {
            throw ApiError.notFound('Domain service not found for the selected client');
        }

        const [details, orderItem] = await Promise.all([
            DomainServiceDetails.findOne({ serviceId }).select('-eppCodeEncrypted').lean<any>(),
            OrderItem.findById(service.orderItemId).select('configSnapshot nameSnapshot pricingSnapshot').lean<any>(),
        ]);
        const domainName =
            resolveDomainFqdnFromDetailsAndOrderItem(details, orderItem) ||
            normalizeDomainFqdn((details as any)?.domainName) ||
            '';
        const registrarFromOrder = String((orderItem as any)?.configSnapshot?.registrar || '').trim();
        const registrar = details?.registrar || registrarFromOrder || service.provisioning?.provider || '';
        const expiresAt = details?.expiresAt || service.nextDueDate;
        const syncState = this.deriveSyncState({
            syncStatus: details?.syncStatus,
            lastRegistrarSyncAt: details?.lastRegistrarSyncAt,
        });

        return {
            service: {
                id: service._id?.toString?.(),
                serviceId: service._id?.toString?.(),
                serviceNumber: service.serviceNumber,
                type: service.type,
                status: service.status,
                rawStatus: service.status,
                packageName: orderItem?.nameSnapshot || domainName || 'Domain',
                domain: domainName,
                identifier: domainName,
                billingCycle: service.billingCycle,
                currency: service.currency,
                priceSnapshot: service.priceSnapshot,
                autoRenew: service.autoRenew,
                createdAt: service.createdAt,
                updatedAt: service.updatedAt,
                adminNotes: service.meta?.adminNotes || '',
                billing: {
                    firstPaymentAmount: service.priceSnapshot?.total ?? 0,
                    recurringAmount: service.priceSnapshot?.recurring ?? service.priceSnapshot?.total ?? 0,
                    billingCycle: service.billingCycle,
                    paymentMethod: '—',
                    registrationDate: service.createdAt,
                    nextDueDate: service.nextDueDate,
                    currency: service.currency,
                },
                provisioning: service.provisioning,
                meta: service.meta,
            },
            domain: {
                serviceId: service._id?.toString?.(),
                domainName,
                domain: domainName,
                status: details?.registrarStatus || details?.lifecycleStatus || service.status,
                registrar,
                registrarStatus: details?.registrarStatus,
                lifecycleStatus: details?.lifecycleStatus,
                lifecycleReason: details?.lifecycleReason,
                transferStatus: details?.transferStatus,
                registeredAt: details?.registeredAt,
                expirationDate: expiresAt,
                expiresAt,
                nameservers: details?.nameservers || [],
                locked: !!details?.registrarLock,
                registrarLock: !!details?.registrarLock,
                contacts: this.toRegistrarContactDetails(details?.contacts),
                dnsRecords: details?.dnsRecords || [],
                syncStatus: details?.syncStatus || 'pending',
                syncMessage: details?.syncMessage || '',
                syncState,
                lastRegistrarSyncAt: details?.lastRegistrarSyncAt,
                source: details?.source,
            },
            details,
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
        const details = await this.getStoredDomainDetailsByName(domain);
        if (!details) {
            throw ApiError.notFound('Domain details not found. Sync the domain from registrar first.');
        }
        const registrarName = await this.getStoredRegistrarName(domain);
        const live = await domainRegistrarService.getRegistrarLock(domain, registrarName);
        await this.syncStoredDomainDetails(domain, {
            registrarLock: live.locked,
            lastRegistrarSyncAt: new Date(),
            registrar: live.registrar,
            syncStatus: 'success',
        });
        return { locked: live.locked };
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
        const details = await this.getStoredDomainDetailsByName(domain);
        if (!details) {
            throw ApiError.notFound('Domain details not found. Sync the domain from registrar first.');
        }
        const registrarName = await this.getStoredRegistrarName(domain);
        const live = await domainRegistrarService.getContactDetails(domain, registrarName);
        const contacts: DomainContactDetails = {
            registrant: live.registrant,
            admin: live.admin,
            tech: live.tech,
            billing: live.billing,
        };
        await this.syncStoredDomainDetails(domain, {
            contacts: this.mergeStoredContacts(undefined, contacts),
            lastRegistrarSyncAt: new Date(),
            registrar: live.registrar,
            syncStatus: 'success',
        });
        return contacts;
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
        const details = await this.getStoredDomainDetailsByName(domain);
        if (!details) {
            throw ApiError.notFound('Domain details not found. Sync the domain from registrar first.');
        }
        const registrarName = await this.getStoredRegistrarName(domain);
        const live = await domainRegistrarService.getDns(domain, registrarName);
        await this.syncStoredDomainDetails(domain, {
            dnsRecords: live.records,
            lastRegistrarSyncAt: new Date(),
            registrar: live.registrar,
            syncStatus: 'success',
        });
        return live.records;
    }

    async saveDns(domain: string, records: DnsRecord[]): Promise<void> {
        const registrarName = await this.getStoredRegistrarName(domain);
        const result = await domainRegistrarService.saveDns(domain, records, registrarName);
        await this.syncStoredDomainDetails(domain, {
            dnsRecords: records,
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
        const [{ metadata = [], results = [] } = { metadata: [], results: [] }] = await Service.aggregate([
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
        const service = await Service.findById(serviceId).lean();
        if (!service || service.type !== ServiceType.DOMAIN) {
            throw ApiError.notFound('Domain service not found');
        }

        let details = await DomainServiceDetails.findOne({ serviceId }).lean<any>();
        const orderItem = await OrderItem.findById(service.orderItemId).select('configSnapshot nameSnapshot').lean();
        const orderRegistrar = String((orderItem as any)?.configSnapshot?.registrar || '').trim().toLowerCase();
        const fqdn =
            resolveDomainFqdnFromDetailsAndOrderItem(details, orderItem) ||
            normalizeDomainFqdn((details as any)?.domainName);
        if (!fqdn) {
            throw ApiError.badRequest('Domain name could not be resolved for sync.');
        }
        if (details && normalizeDomainFqdn((details as any)?.domainName) !== fqdn) {
            await DomainServiceDetails.updateOne({ serviceId }, { $set: { domainName: fqdn } }).exec();
            (details as any).domainName = fqdn;
        }

        try {
            const preferredRegistrar = details?.registrar || orderRegistrar || undefined;
            const liveInfo = await domainRegistrarService.syncDomain(fqdn, preferredRegistrar);

            if (!details) {
                await this.upsertAdoptedDomainDetails({
                    serviceId,
                    domainName: fqdn,
                    registrar: liveInfo.registrar || preferredRegistrar || '',
                    liveInfo,
                });
                details = await DomainServiceDetails.findOne({ serviceId }).lean<any>();
                if (!details) {
                    throw ApiError.badRequest('Domain details could not be created from registrar sync');
                }
            }

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
            const lifecycleStatus = this.deriveLifecycleStatusFromLiveInfo(liveInfo, {
                operationType: details.operationType,
                transferStatus: nextTransferStatus,
                expiresAt: liveInfo.expiryDate,
            });
            await DomainServiceDetails.updateOne(
                { serviceId },
                {
                    $set: {
                        expiresAt: liveInfo.expiryDate,
                        nameservers: liveInfo.nameservers ?? [],
                        ...(liveInfo.contacts
                            ? {
                                  contacts: {
                                      registrant: this.toStoredDomainContact(liveInfo.contacts.registrant),
                                      admin: this.toStoredDomainContact(liveInfo.contacts.admin),
                                      tech: this.toStoredDomainContact(liveInfo.contacts.tech),
                                      billing: this.toStoredDomainContact(liveInfo.contacts.billing),
                                  },
                                  contactsSameAsRegistrant: false,
                              }
                            : {}),
                        registrarLock: liveInfo.locked,
                        registrar: liveInfo.registrar,
                        registrarStatus: liveInfo.status,
                        transferStatus: nextTransferStatus,
                        lifecycleStatus,
                        lifecycleReason: 'Updated from registrar sync',
                        lifecycleUpdatedAt: syncedAt,
                        lastAutoStatusAt: syncedAt,
                        lastRegistrarSyncAt: syncedAt,
                        syncStatus: 'success',
                        syncMessage: 'Synced successfully',
                    },
                }
            ).exec();

            const serviceSyncUpdate: Record<string, any> = {
                $set: {
                    ...(
                        lifecycleStatus === DomainLifecycleStatus.ACTIVE &&
                        !((service.meta as any)?.domainRecoveryPendingConfirmation)
                            ? { status: ServiceStatus.ACTIVE }
                            : {}
                    ),
                    'provisioning.lastSyncedAt': syncedAt,
                    'provisioning.lastError': '',
                },
            };
            if (lifecycleStatus === DomainLifecycleStatus.ACTIVE) {
                serviceSyncUpdate.$unset = {
                    'meta.domainRecoveryAvailable': '',
                    'meta.domainRecoveryReason': '',
                };
            }
            await Service.updateOne({ _id: serviceId }, serviceSyncUpdate).exec();

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
        missingDomains: Array<{
            domainName: string;
            registrar: string;
            alreadyImported: boolean;
            matchedFailedServices: Array<{ serviceId: string; serviceNumber?: string; clientId: string; status: string }>;
            recommendedAction: 'attach_to_failed_service' | 'import_as_new_service';
        }>;
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
        const failedMatches = await this.findRecoverableServiceMatches(normalizedDomains);

        const missingDomains = normalizedDomains
            .filter((domainName) => !knownSet.has(domainName))
            .map((domainName) => ({
                domainName,
                registrar: normalizedRegistrar,
                alreadyImported: importedSet.has(domainName),
                matchedFailedServices: failedMatches.get(domainName) ?? [],
                recommendedAction: (failedMatches.get(domainName)?.length ? 'attach_to_failed_service' : 'import_as_new_service') as
                    | 'attach_to_failed_service'
                    | 'import_as_new_service',
            }));

        return {
            registrar: normalizedRegistrar,
            totalDomains: normalizedDomains.length,
            knownCount: knownSet.size,
            missingDomains,
        };
    }

    async adoptRegistrarDomainForService(
        payload: { serviceId: string; domainName?: string; registrar?: string },
        actorId?: string
    ): Promise<any> {
        const service = await Service.findById(payload.serviceId).exec();
        if (!service || service.type !== ServiceType.DOMAIN) {
            throw ApiError.notFound('Domain service not found');
        }

        if (![ServiceStatus.FAILED, ServiceStatus.PENDING, ServiceStatus.PROVISIONING].includes(service.status as ServiceStatus)) {
            throw ApiError.badRequest('Only failed, pending, or provisioning domain services can be recovered');
        }

        const orderItem = await OrderItem.findById(service.orderItemId).select('configSnapshot nameSnapshot').lean();
        const requestedDomain = normalizeDomainFqdn(payload.domainName || '');
        const orderDomain = resolveDomainFqdnFromDetailsAndOrderItem(undefined, orderItem);
        const domainName = requestedDomain || orderDomain;
        if (!domainName) {
            throw ApiError.badRequest('Domain name is required for recovery');
        }

        const registrar = String(payload.registrar || (orderItem as any)?.configSnapshot?.registrar || '').trim().toLowerCase() || undefined;
        const liveInfo = await this.fetchLiveDomainForAdoption(domainName, registrar);
        const details = await this.upsertAdoptedDomainDetails({
            serviceId: (service._id as any).toString(),
            domainName,
            registrar: liveInfo.registrar || registrar || '',
            liveInfo,
        });

        const syncedAt = new Date();
        await Service.updateOne(
            { _id: service._id },
            {
                $set: {
                    status: ServiceStatus.PROVISIONING,
                    provisioning: {
                        ...(service.provisioning || {}),
                        provider: liveInfo.registrar || registrar || 'registrar',
                        remoteId: domainName,
                        lastSyncedAt: syncedAt,
                        lastError: '',
                    },
                    meta: {
                        ...(service.meta || {}),
                        domainRecoveryAvailable: true,
                        domainRecoveryPendingConfirmation: true,
                        domainRecoveryReason: 'adopted_from_registrar',
                        recoverableDomainName: domainName,
                        recoveredRegistrar: liveInfo.registrar || registrar,
                        recoveredAt: syncedAt.toISOString(),
                    },
                },
            }
        ).exec();

        auditLogSafe({
            message: `Domain recovery attached: ${domainName}`,
            type: 'domain_imported',
            category: 'domain',
            actorType: actorId ? 'user' : 'system',
            actorId,
            source: actorId ? 'manual' : 'system',
            status: 'pending',
            clientId: (service.clientId as any)?.toString?.(),
            serviceId: (service._id as any)?.toString?.(),
            meta: { domainName, registrar: liveInfo.registrar || registrar, recoveryMode: 'attach' },
        });

        return {
            serviceId: (service._id as any).toString(),
            domainName,
            registrar: liveInfo.registrar || registrar,
            status: ServiceStatus.PROVISIONING,
            confirmationRequired: true,
            details,
        };
    }

    async importRegistrarDomainForClient(
        payload: {
            clientId: string;
            domainName: string;
            registrar?: string;
            billingCycle?: string;
            priceSnapshot?: DomainRecoveryPriceSnapshot;
            nextDueDate?: string | Date;
            reason?: string;
        },
        actorId?: string
    ): Promise<any> {
        const domainName = normalizeDomainFqdn(payload.domainName || '');
        if (!domainName) throw ApiError.badRequest('Domain name is required');

        const client = await Client.findById(payload.clientId).lean<any>();
        if (!client) throw ApiError.notFound('Client not found');

        const liveInfo = await this.fetchLiveDomainForAdoption(domainName, payload.registrar);
        await this.assertDomainNotLinkedToAnotherService(domainName);
        const billingCycle = normalizeBillingCycle(payload.billingCycle || BillingCycle.ANNUALLY);
        const clientDefaultCurrency =
            String((client as any).accountCreditCurrency || '').trim().toUpperCase() || DEFAULT_CURRENCY;
        const priceSnapshot = this.normalizeRecoveryPriceSnapshot(payload.priceSnapshot, clientDefaultCurrency);

        const orderSeq = await getNextSequence('order');
        const orderId = formatSequenceId('ORD', orderSeq);
        const orderNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        const order = await Order.create({
            orderId,
            orderNumber,
            clientId: client._id,
            userId: client.user,
            status: OrderStatus.ACTIVE,
            currency: priceSnapshot.currency,
            subtotal: priceSnapshot.total,
            discountTotal: priceSnapshot.discount,
            taxTotal: priceSnapshot.tax,
            total: priceSnapshot.total,
            paidAt: new Date(),
            meta: {
                source: 'registrar_import',
                domainName,
                registrar: liveInfo.registrar || payload.registrar,
                createdBy: actorId,
                reason: payload.reason,
            },
        });

        const tld = this.getTldFromDomain(domainName);
        const orderItem = await OrderItem.create({
            orderId: order._id,
            clientId: client._id,
            type: ServiceType.DOMAIN,
            actionType: DomainActionType.REGISTER,
            nameSnapshot: domainName,
            billingCycle,
            qty: 1,
            pricingSnapshot: priceSnapshot,
            configSnapshot: {
                domainName,
                tld: `.${tld}`,
                period: this.yearsFromBillingCycle(billingCycle),
                years: this.yearsFromBillingCycle(billingCycle),
                registrar: liveInfo.registrar || payload.registrar,
                source: 'registrar_import',
            },
            meta: { source: 'registrar_import', reason: payload.reason },
        });

        const svcSeq = await getNextSequence('service');
        const service = await serviceRepository.create({
            serviceNumber: formatSequenceId('SVC', svcSeq),
            clientId: client._id,
            userId: client.user,
            orderId: order._id,
            orderItemId: orderItem._id,
            type: ServiceType.DOMAIN,
            status: ServiceStatus.PROVISIONING,
            billingCycle,
            currency: priceSnapshot.currency,
            priceSnapshot,
            autoRenew: true,
            nextDueDate: payload.nextDueDate ? new Date(payload.nextDueDate) : liveInfo.expiryDate || new Date(),
            provisioning: {
                provider: liveInfo.registrar || payload.registrar || 'registrar',
                remoteId: domainName,
                lastSyncedAt: new Date(),
                lastError: '',
            },
            meta: {
                source: 'registrar_import',
                domainRecoveryAvailable: true,
                domainRecoveryPendingConfirmation: true,
                domainRecoveryReason: 'standalone_registrar_import',
                recoverableDomainName: domainName,
                recoveredRegistrar: liveInfo.registrar || payload.registrar,
                recoveredAt: new Date().toISOString(),
                adoptionReason: payload.reason,
            },
        } as any);

        const details = await this.upsertAdoptedDomainDetails({
            serviceId: (service as any)._id.toString(),
            domainName,
            registrar: liveInfo.registrar || payload.registrar || '',
            liveInfo,
        });

        auditLogSafe({
            message: `Registrar domain imported for client: ${domainName}`,
            type: 'domain_imported',
            category: 'domain',
            actorType: actorId ? 'user' : 'system',
            actorId,
            source: actorId ? 'manual' : 'system',
            status: 'pending',
            clientId: client._id?.toString?.(),
            serviceId: (service as any)._id?.toString?.(),
            orderId: (order as any)._id?.toString?.(),
            meta: { domainName, registrar: liveInfo.registrar || payload.registrar, recoveryMode: 'standalone_import' },
        });

        return {
            serviceId: (service as any)._id.toString(),
            orderId: (order as any)._id.toString(),
            orderItemId: (orderItem as any)._id.toString(),
            domainName,
            registrar: liveInfo.registrar || payload.registrar,
            status: ServiceStatus.PROVISIONING,
            confirmationRequired: true,
            details,
        };
    }

    async adoptExistingRegistrarDomainForClient(
        payload: {
            clientId: string;
            domainName: string;
            registrar?: string;
            billingCycle?: string;
            priceSnapshot?: DomainRecoveryPriceSnapshot;
            nextDueDate?: string | Date;
            reason?: string;
        },
        actorId?: string
    ): Promise<any> {
        const imported = await this.importRegistrarDomainForClient(
            {
                ...payload,
                reason: payload.reason || 'Silent admin adoption of existing registrar domain',
            },
            actorId
        );
        const activated = await this.confirmRecoveredDomainService(imported.serviceId, actorId);

        return {
            ...imported,
            status: (activated as any)?.status,
            activated: true,
            confirmationRequired: false,
        };
    }

    async confirmRecoveredDomainService(serviceId: string, actorId?: string): Promise<any> {
        const service = await Service.findById(serviceId).exec();
        if (!service || service.type !== ServiceType.DOMAIN) {
            throw ApiError.notFound('Domain service not found');
        }

        const details = await DomainServiceDetails.findOne({ serviceId }).lean<any>();
        if (!details) {
            throw ApiError.badRequest('Domain details must be synced before activation');
        }
        if (details.syncStatus !== 'success') {
            throw ApiError.badRequest('Domain recovery must sync successfully before activation');
        }
        if (!(service.meta as any)?.domainRecoveryPendingConfirmation && details.source !== 'registrar_import') {
            throw ApiError.badRequest('Service is not pending domain recovery confirmation');
        }

        const previousStatus = service.status;
        await Service.updateOne(
            { _id: service._id },
            {
                $set: {
                    status: ServiceStatus.ACTIVE,
                    'provisioning.lastError': '',
                    'provisioning.lastSyncedAt': new Date(),
                },
                $unset: {
                    'meta.domainRecoveryAvailable': '',
                    'meta.domainRecoveryPendingConfirmation': '',
                    'meta.domainRecoveryReason': '',
                    'meta.recoverableDomainName': '',
                    'meta.recoveredRegistrar': '',
                    'meta.recoveredAt': '',
                },
            }
        ).exec();

        auditLogSafe({
            message: `Recovered domain activated: ${details.domainName}`,
            type: 'domain_synced',
            category: 'domain',
            actorType: actorId ? 'user' : 'system',
            actorId,
            source: actorId ? 'manual' : 'system',
            status: 'success',
            clientId: (service.clientId as any)?.toString?.(),
            serviceId,
            meta: {
                domainName: details.domainName,
                registrar: details.registrar,
                previousStatus,
                recoveryConfirmed: true,
            },
        });

        return await Service.findById(serviceId).lean();
    }

    async updateDomainStatusAdmin(
        serviceId: string,
        payload: {
            serviceStatus?: string;
            lifecycleStatus?: string;
            transferStatus?: string;
            reason?: string;
            manualStatusOverrideUntil?: string | Date | null;
        },
        actorId?: string
    ): Promise<any> {
        const service = await Service.findById(serviceId).exec();
        if (!service || service.type !== ServiceType.DOMAIN) {
            throw ApiError.notFound('Domain service not found');
        }

        const details = await DomainServiceDetails.findOne({ serviceId }).exec();
        if (!details) {
            throw ApiError.notFound('Domain service details not found');
        }

        const before = {
            serviceStatus: service.status,
            lifecycleStatus: details.lifecycleStatus,
            transferStatus: details.transferStatus,
        };
        const now = new Date();

        if (payload.serviceStatus) {
            const targetServiceStatus = normalizeServiceStatus(payload.serviceStatus);
            const extra: Record<string, unknown> = {};
            if (targetServiceStatus === ServiceStatus.ACTIVE) {
                extra.suspendedAt = null;
                extra.terminatedAt = null;
                extra.cancelledAt = null;
            }
            await serviceRepository.updateStatus(serviceId, targetServiceStatus, extra as any);
        }

        const detailUpdates: Record<string, unknown> = {};
        if (payload.lifecycleStatus) {
            const lifecycleStatus = this.normalizeDomainLifecycleStatus(payload.lifecycleStatus);
            detailUpdates.lifecycleStatus = lifecycleStatus;
            detailUpdates.lifecycleReason = String(payload.reason || 'Manual admin status update').trim();
            detailUpdates.lifecycleUpdatedAt = now;
            detailUpdates.lastManualStatusAt = now;
        }
        if (payload.transferStatus) {
            const transferStatus = String(payload.transferStatus).trim().toUpperCase();
            if (!Object.values(DomainTransferStatus).includes(transferStatus as DomainTransferStatus)) {
                throw ApiError.badRequest(`Invalid transferStatus: ${payload.transferStatus}`);
            }
            detailUpdates.transferStatus = transferStatus;
        }
        if (payload.manualStatusOverrideUntil !== undefined) {
            detailUpdates.manualStatusOverrideUntil = payload.manualStatusOverrideUntil
                ? new Date(payload.manualStatusOverrideUntil)
                : null;
        }

        if (Object.keys(detailUpdates).length > 0) {
            await DomainServiceDetails.updateOne({ serviceId }, { $set: detailUpdates }).exec();
        }

        const [updatedService, updatedDetails] = await Promise.all([
            Service.findById(serviceId).lean(),
            DomainServiceDetails.findOne({ serviceId }).lean(),
        ]);

        auditLogSafe({
            message: `Domain status updated: ${details.domainName}`,
            type: 'settings_changed',
            category: 'domain',
            actorType: actorId ? 'user' : 'system',
            actorId,
            source: actorId ? 'manual' : 'system',
            status: 'success',
            clientId: (service.clientId as any)?.toString?.(),
            serviceId,
            meta: {
                domainName: details.domainName,
                before,
                after: {
                    serviceStatus: (updatedService as any)?.status,
                    lifecycleStatus: (updatedDetails as any)?.lifecycleStatus,
                    transferStatus: (updatedDetails as any)?.transferStatus,
                },
                reason: payload.reason,
            },
        });

        return {
            service: updatedService,
            details: updatedDetails,
            statusOptions: this.getDomainStatusOptions(),
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
                lifecycleStatus: details?.lifecycleStatus,
                lifecycleReason: details?.lifecycleReason,
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
        return this.buildServiceFirstAdminInventoryPipeline(filter);
    }

    private buildServiceFirstAdminInventoryPipeline(filter: {
        search?: string;
        registrar?: string;
        serviceStatus?: string;
        transferStatus?: string;
        syncState?: string;
        source?: string;
    }): any[] {
        const pipeline: any[] = [
            {
                $match: {
                    type: ServiceType.DOMAIN,
                },
            },
            {
                $lookup: {
                    from: DomainServiceDetails.collection.collectionName,
                    let: { serviceId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$serviceId', '$$serviceId'] } } },
                        { $limit: 1 },
                    ],
                    as: 'details',
                },
            },
            { $unwind: { path: '$details', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: OrderItem.collection.collectionName,
                    localField: 'orderItemId',
                    foreignField: '_id',
                    as: '_oiInv',
                },
            },
            { $unwind: { path: '$_oiInv', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'clients',
                    localField: 'clientId',
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
                    serviceNumber: '$serviceNumber',
                    serviceStatus: '$status',
                    domainName: {
                        $ifNull: [
                            '$details.domainName',
                            {
                                $ifNull: [
                                    '$_oiInv.configSnapshot.domainName',
                                    { $ifNull: ['$_oiInv.configSnapshot.domain', ''] },
                                ],
                            },
                        ],
                    },
                    registrar: {
                        $ifNull: ['$details.registrar', { $ifNull: ['$_oiInv.configSnapshot.registrar', ''] }],
                    },
                    registrarStatus: '$details.registrarStatus',
                    lifecycleStatus: '$details.lifecycleStatus',
                    lifecycleReason: '$details.lifecycleReason',
                    lifecycleUpdatedAt: '$details.lifecycleUpdatedAt',
                    lastAutoStatusAt: '$details.lastAutoStatusAt',
                    lastManualStatusAt: '$details.lastManualStatusAt',
                    manualStatusOverrideUntil: '$details.manualStatusOverrideUntil',
                    transferStatus: '$details.transferStatus',
                    nameservers: { $ifNull: ['$details.nameservers', []] },
                    registrarLock: '$details.registrarLock',
                    expiresAt: '$details.expiresAt',
                    registeredAt: '$details.registeredAt',
                    lastRegistrarSyncAt: '$details.lastRegistrarSyncAt',
                    syncStatus: '$details.syncStatus',
                    syncMessage: '$details.syncMessage',
                    source: '$details.source',
                    _inventorySearchDomain: {
                        $let: {
                            vars: {
                                fromDetails: { $toLower: { $trim: { input: { $ifNull: ['$details.domainName', ''] } } } },
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
            matchClauses.push({ status: filter.serviceStatus.trim().toUpperCase() });
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
                serviceId: '$_id',
                orderItemId: '$orderItemId',
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
                lifecycleStatus: 1,
                lifecycleReason: 1,
                lifecycleUpdatedAt: 1,
                lastAutoStatusAt: 1,
                lastManualStatusAt: 1,
                manualStatusOverrideUntil: 1,
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
        const results = await Service.aggregate([
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

    private async fetchLiveDomainForAdoption(domainName: string, registrar?: string): Promise<DomainInformation & { registrar: string }> {
        try {
            return await domainRegistrarService.syncDomain(domainName, registrar);
        } catch (error: any) {
            await RegistrarDiscoveredDomain.findOneAndUpdate(
                { domainName, registrar: String(registrar || '').toLowerCase() || 'unknown' },
                {
                    $set: {
                        domainName,
                        registrar: String(registrar || '').toLowerCase() || 'unknown',
                        syncStatus: 'failure',
                        syncMessage: error?.message || 'Registrar domain adoption sync failed',
                        lastDetectedAt: new Date(),
                    },
                },
                { upsert: true }
            ).exec();
            throw error;
        }
    }

    private async upsertAdoptedDomainDetails(params: {
        serviceId: string;
        domainName: string;
        registrar: string;
        liveInfo: DomainInformation & { registrar?: string };
    }): Promise<any> {
        const normalized = normalizeDomainFqdn(params.domainName);
        if (!normalized) throw ApiError.badRequest('Invalid domain name');

        await this.assertDomainNotLinkedToAnotherService(normalized, params.serviceId);

        const now = new Date();
        const nameservers = await this.resolveAdoptionNameservers(params.liveInfo.nameservers, normalized);
        const detailsPayload = {
            domainName: normalized,
            sld: this.getSldFromDomain(normalized),
            tld: this.getTldFromDomain(normalized),
            registrar: String(params.liveInfo.registrar || params.registrar || '').toLowerCase() || 'registrar',
            operationType: DomainOperationType.REGISTER,
            contacts: {
                registrant: this.toStoredDomainContact(params.liveInfo.contacts?.registrant),
                admin: this.toStoredDomainContact(params.liveInfo.contacts?.admin),
                tech: this.toStoredDomainContact(params.liveInfo.contacts?.tech),
                billing: this.toStoredDomainContact(params.liveInfo.contacts?.billing),
            },
            contactsSameAsRegistrant: false,
            nameservers,
            registrarLock: !!params.liveInfo.locked,
            whoisPrivacy: /yes|true|enabled/i.test(String(params.liveInfo.privacy || '')),
            dnssecEnabled: false,
            dnsManagementEnabled: false,
            emailForwardingEnabled: false,
            registeredAt: params.liveInfo.registrationDate,
            expiresAt: params.liveInfo.expiryDate,
            registrarStatus: params.liveInfo.status,
            lifecycleStatus: this.deriveLifecycleStatusFromLiveInfo(params.liveInfo, {
                operationType: DomainOperationType.REGISTER,
                expiresAt: params.liveInfo.expiryDate,
            }),
            lifecycleReason: 'Adopted from registrar',
            lifecycleUpdatedAt: now,
            lastAutoStatusAt: now,
            syncStatus: 'success' as const,
            syncMessage: 'Adopted from registrar',
            source: 'registrar_import' as const,
            lastRegistrarSyncAt: now,
            eppStatusCodes: params.liveInfo.locked ? ['clientTransferProhibited'] : [],
        };

        const updated = await DomainServiceDetails.findOneAndUpdate(
            { serviceId: params.serviceId },
            {
                $set: detailsPayload,
                $setOnInsert: { serviceId: params.serviceId },
            },
            { new: true, upsert: true, runValidators: true }
        ).lean();

        await RegistrarDiscoveredDomain.findOneAndUpdate(
            { domainName: normalized, registrar: detailsPayload.registrar },
            {
                $set: {
                    domainName: normalized,
                    registrar: detailsPayload.registrar,
                    registrarStatus: params.liveInfo.status,
                    expiresAt: params.liveInfo.expiryDate,
                    nameservers,
                    registrarLock: !!params.liveInfo.locked,
                    syncStatus: 'success',
                    syncMessage: 'Linked to billing service',
                    lastDetectedAt: now,
                    importedAt: now,
                    lastRegistrarSyncAt: now,
                },
            },
            { upsert: true, new: true }
        ).exec();

        return updated;
    }

    private async assertDomainNotLinkedToAnotherService(domainName: string, allowedServiceId?: string): Promise<void> {
        const normalized = normalizeDomainFqdn(domainName);
        if (!normalized) throw ApiError.badRequest('Invalid domain name');
        const existingForDomain = await DomainServiceDetails.findOne({
            $expr: { $eq: [{ $toLower: '$domainName' }, normalized] },
        }).lean<any>();
        if (existingForDomain && existingForDomain.serviceId?.toString?.() !== allowedServiceId) {
            throw ApiError.badRequest('Domain is already linked to another service');
        }
    }

    private async resolveAdoptionNameservers(liveNameservers: string[] | undefined, domainName: string): Promise<string[]> {
        const live = (liveNameservers || []).map((ns) => String(ns || '').trim().toLowerCase()).filter(Boolean);
        if (live.length >= 2) return live.slice(0, 13);
        const defaults = await getEffectiveDefaultNameserversForProvision();
        if (defaults.length >= 2) return defaults.slice(0, 13);
        return [`ns1.${domainName}`, `ns2.${domainName}`];
    }

    private normalizeRecoveryPriceSnapshot(snapshot: DomainRecoveryPriceSnapshot | undefined, fallbackCurrency: string) {
        const currency = String(snapshot?.currency || fallbackCurrency || DEFAULT_CURRENCY).toUpperCase();
        const setup = this.nonNegativeNumber(snapshot?.setup);
        const recurring = this.nonNegativeNumber(snapshot?.recurring);
        const discount = this.nonNegativeNumber(snapshot?.discount);
        const tax = this.nonNegativeNumber(snapshot?.tax);
        const total = snapshot?.total == null ? Math.max(0, setup + recurring + tax - discount) : this.nonNegativeNumber(snapshot.total);
        return { setup, recurring, discount, tax, total, currency };
    }

    private nonNegativeNumber(value: unknown): number {
        const n = Number(value ?? 0);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    }

    private getTldFromDomain(domainName: string): string {
        const parts = domainName.split('.').filter(Boolean);
        return parts.length > 1 ? parts.slice(1).join('.') : 'com';
    }

    private getSldFromDomain(domainName: string): string {
        const tld = this.getTldFromDomain(domainName);
        return domainName.replace(new RegExp(`\\.${escapeRegex(tld)}$`, 'i'), '') || domainName.split('.')[0] || domainName;
    }

    private yearsFromBillingCycle(billingCycle: BillingCycle): number {
        if (billingCycle === BillingCycle.BIENNIALLY) return 2;
        if (billingCycle === BillingCycle.TRIENNIALLY) return 3;
        return 1;
    }

    private async resolveDomainRenewalAmount(
        domainName: string,
        currency: string,
        years: number,
        fallbackAmount: number
    ): Promise<number> {
        if (fallbackAmount > 0) return fallbackAmount;

        try {
            const tld = `.${this.getTldFromDomain(domainName)}`;
            const tldDoc: any = await tldService.getTLDByExtension(tld);
            const pricing = tldDoc?.pricing?.find((p: any) => String(p.currency || '').toUpperCase() === currency.toUpperCase())
                || tldDoc?.pricing?.[0];
            const yearKey = String(Math.min(Math.max(years, 1), 3));
            const detail = pricing?.[yearKey] || pricing?.[years as any] || pricing?.['1'];
            const amount = Number(detail?.renew ?? detail?.register ?? 0);
            return amount > 0 ? amount : 0;
        } catch {
            return 0;
        }
    }

    private normalizeDomainLifecycleStatus(value: string): DomainLifecycleStatus {
        const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
        if (Object.values(DomainLifecycleStatus).includes(normalized as DomainLifecycleStatus)) {
            return normalized as DomainLifecycleStatus;
        }
        throw ApiError.badRequest(`Invalid lifecycleStatus: ${value}`);
    }

    private deriveLifecycleStatusFromLiveInfo(
        liveInfo: DomainInformation,
        context: { operationType?: string; transferStatus?: string; expiresAt?: Date }
    ): DomainLifecycleStatus {
        const rawStatus = String(liveInfo.status || '').toLowerCase();
        const raw = `${rawStatus} ${String(liveInfo.renewOption || '').toLowerCase()} ${JSON.stringify(liveInfo.raw || {}).toLowerCase()}`;
        const expiry = context.expiresAt || liveInfo.expiryDate;
        const now = new Date();

        if (context.operationType === DomainOperationType.TRANSFER) {
            if (context.transferStatus === DomainTransferStatus.REJECTED) return DomainLifecycleStatus.FRAUD;
            if (context.transferStatus === DomainTransferStatus.CANCELLED) return DomainLifecycleStatus.CANCELLED;
            if (context.transferStatus !== DomainTransferStatus.COMPLETED) return DomainLifecycleStatus.PENDING_TRANSFER;
        }
        if (/transfer.*away|transferred.*away|not in account|not found|external/i.test(raw)) {
            return DomainLifecycleStatus.TRANSFERRED_AWAY;
        }
        if (/redemption|restore/i.test(raw)) return DomainLifecycleStatus.REDEMPTION_PERIOD_EXPIRED;
        if (/grace/i.test(raw)) return DomainLifecycleStatus.GRACE_PERIOD_EXPIRED;
        if (/cancel/i.test(raw)) return DomainLifecycleStatus.CANCELLED;
        if (/fraud/i.test(raw)) return DomainLifecycleStatus.FRAUD;
        if (expiry && expiry.getTime() < now.getTime()) return DomainLifecycleStatus.EXPIRED;
        if (/active|ok|clienttransferprohibited|locked/i.test(raw) || liveInfo.domain) {
            return DomainLifecycleStatus.ACTIVE;
        }
        return context.operationType === DomainOperationType.TRANSFER
            ? DomainLifecycleStatus.PENDING_TRANSFER
            : DomainLifecycleStatus.PENDING_REGISTRATION;
    }

    private async findRecoverableServiceMatches(
        domainNames: string[]
    ): Promise<Map<string, Array<{ serviceId: string; serviceNumber?: string; clientId: string; status: string }>>> {
        const matches = new Map<string, Array<{ serviceId: string; serviceNumber?: string; clientId: string; status: string }>>();
        if (!domainNames.length) return matches;

        const services = await Service.find({
            type: ServiceType.DOMAIN,
            status: { $in: [ServiceStatus.FAILED, ServiceStatus.PENDING, ServiceStatus.PROVISIONING] },
        })
            .select('_id serviceNumber clientId status orderItemId')
            .lean<any>();
        const orderItemIds = services.map((s: any) => s.orderItemId).filter(Boolean);
        const orderItems = await OrderItem.find({ _id: { $in: orderItemIds } }).select('configSnapshot nameSnapshot').lean<any>();
        const orderItemById = Object.fromEntries(orderItems.map((item: any) => [item._id.toString(), item]));
        const wanted = new Set(domainNames);

        for (const service of services) {
            const orderItem = orderItemById[service.orderItemId?.toString?.()];
            const fqdn = resolveDomainFqdnFromDetailsAndOrderItem(undefined, orderItem);
            if (!fqdn || !wanted.has(fqdn)) continue;
            const rows = matches.get(fqdn) ?? [];
            rows.push({
                serviceId: service._id.toString(),
                serviceNumber: service.serviceNumber,
                clientId: service.clientId?.toString?.(),
                status: service.status,
            });
            matches.set(fqdn, rows);
        }

        return matches;
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
            dnsRecords: DnsRecord[];
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

    private async getStoredDomainDetailsByName(domainName: string): Promise<any | null> {
        const normalized = normalizeDomainFqdn(domainName);
        if (!normalized) return null;
        return DomainServiceDetails.findOne({
            $expr: { $eq: [{ $toLower: '$domainName' }, normalized] },
        })
            .select('-eppCodeEncrypted')
            .lean<any>();
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

    private toRegistrarContactDetails(
        contacts?: {
            registrant?: Partial<IDomainContact>;
            admin?: Partial<IDomainContact>;
            tech?: Partial<IDomainContact>;
            billing?: Partial<IDomainContact>;
        }
    ): DomainContactDetails {
        const convert = (contact?: Partial<IDomainContact>): RegistrarContact => {
            const firstName = String(contact?.firstName || '').trim();
            const lastName = String(contact?.lastName || '').trim();
            const phone = String(contact?.phone || '').trim();
            return {
                name: [firstName, lastName].filter(Boolean).join(' ').trim(),
                email: contact?.email || '',
                phonenum: phone,
                address1: contact?.address1 || '',
                city: contact?.city || '',
                state: contact?.state || '',
                zip: contact?.postcode || '',
                country: contact?.country || '',
            };
        };
        return {
            registrant: convert(contacts?.registrant),
            admin: convert(contacts?.admin),
            tech: convert(contacts?.tech),
            billing: convert(contacts?.billing),
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

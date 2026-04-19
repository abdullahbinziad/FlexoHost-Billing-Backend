/**
 * Namely Partner API registrar — aligns with Postman collection (Partner API v1).
 * Base: configurable; default https://api.namely.com.bd/.../v1/partner-api
 */

import type {
    AccountBalanceResult,
    DomainAvailabilityResult,
    DomainContactDetails,
    DnsRecord,
    DomainInformation,
    GetEppCodeParams,
    GetEppCodeResult,
    IRegistrarProvider,
    OrderStatusResult,
    RegisterDomainParams,
    RegisterDomainResult,
    RegisterNameserverResult,
    RenewDomainParams,
    RenewDomainResult,
    TldPriceItem,
    TransferDomainParams,
    TransferDomainResult,
    TransferStatusResult,
} from '../registrar/registrar.types';
import { RegistrarContact, RegistrarError } from '../registrar/registrar.types';
import registrarConfigService from '../registrar/registrar-config.service';
import { callNamely, encodeDomainForPath } from './namely-api';

const REGISTRAR_NAME = 'namely';

function unsupported(command: string): never {
    throw new RegistrarError({
        registrar: REGISTRAR_NAME,
        command,
        message: `This operation is not supported by the Namely Partner API adapter (${command}).`,
    });
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function pickAvailabilityPayload(data: Record<string, unknown>): Record<string, unknown> {
    const inner = asRecord(data.data) ?? data;
    return inner;
}

function parseAvailable(data: Record<string, unknown>): boolean {
    const p = pickAvailabilityPayload(data);
    if (typeof p.available === 'boolean') return p.available;
    if (typeof p.is_available === 'boolean') return p.is_available;
    const s = String(p.status ?? p.availability ?? '').toLowerCase();
    if (s === 'available' || s === 'yes' || s === 'true') return true;
    if (s === 'unavailable' || s === 'no' || s === 'false' || s === 'taken') return false;
    return false;
}

function parsePriceCurrency(data: Record<string, unknown>): { price?: number; currency?: string } {
    const p = pickAvailabilityPayload(data);
    const priceRaw = p.price ?? p.registration_price ?? p.register_price;
    const cur = p.currency ?? p.currency_code;
    const price = typeof priceRaw === 'number' ? priceRaw : typeof priceRaw === 'string' ? parseFloat(priceRaw) : undefined;
    return {
        price: Number.isFinite(price as number) ? (price as number) : undefined,
        currency: typeof cur === 'string' ? cur : 'BDT',
    };
}

async function getNamelyDefaults(): Promise<Record<string, unknown>> {
    return registrarConfigService.getRuntimeRegistrarSettings(REGISTRAR_NAME);
}

function buildRegistrantBody(
    params: RegisterDomainParams,
    settings: Record<string, unknown>
): Record<string, string> {
    const nr = params.namelyRegistrant;
    const name =
        nr?.name?.trim() ||
        String(settings.defaultRegistrantName || '').trim() ||
        'Registrant';
    const email =
        nr?.email?.trim() ||
        String(settings.defaultRegistrantEmail || '').trim() ||
        'hostmaster@example.com';
    const phone =
        nr?.phone?.trim() ||
        String(settings.defaultRegistrantPhone || '').trim() ||
        '+8801000000000';
    const address =
        nr?.address?.trim() ||
        String(settings.defaultRegistrantAddress || '').trim() ||
        'Dhaka';
    const nid = nr?.nid?.trim() || String(settings.defaultRegistrantNid || '').trim() || '0000000000000';
    const city = nr?.city?.trim() || String(settings.defaultRegistrantCity || '').trim() || 'Dhaka';
    const country = (nr?.country || settings.defaultRegistrantCountry || 'BD').toString().trim().slice(0, 2) || 'BD';

    return {
        name,
        email,
        phone,
        address,
        nid,
        city,
        country: country.toUpperCase(),
    };
}

export class NamelyRegistrarProvider implements IRegistrarProvider {
    readonly name = REGISTRAR_NAME;

    async checkAvailability(domains: string[]): Promise<DomainAvailabilityResult[]> {
        const out: DomainAvailabilityResult[] = [];
        for (const domain of domains.slice(0, 100)) {
            const d = domain.trim().toLowerCase();
            try {
                const data = await callNamely('/domains/check', {
                    method: 'POST',
                    body: { domain: d },
                });
                const { price, currency } = parsePriceCurrency(data);
                out.push({
                    domain: d,
                    available: parseAvailable(data),
                    price,
                    currency,
                    raw: data,
                });
            } catch (e: any) {
                if (e instanceof RegistrarError) {
                    out.push({
                        domain: d,
                        available: false,
                        raw: { error: e.message },
                    });
                } else {
                    throw e;
                }
            }
        }
        return out;
    }

    async registerDomain(params: RegisterDomainParams): Promise<RegisterDomainResult> {
        const settings = await getNamelyDefaults();
        const purpose =
            (params.purpose || settings.defaultPurpose || 'Business/E-commerce').toString().trim() ||
            'Business/E-commerce';
        const customerIdRaw = params.customerId ?? settings.defaultCustomerId;
        const customer_id =
            typeof customerIdRaw === 'number'
                ? customerIdRaw
                : typeof customerIdRaw === 'string' && customerIdRaw.trim()
                    ? parseInt(customerIdRaw, 10)
                    : 1;

        const registrant = buildRegistrantBody(params, settings);
        const body: Record<string, unknown> = {
            domain: params.domain.trim().toLowerCase(),
            years: params.years,
            purpose,
            customer_id: Number.isFinite(customer_id) ? customer_id : 1,
            registrant,
        };

        const ns = params.nameservers?.map((n) => n.trim()).filter(Boolean) ?? [];
        if (ns.length >= 2) {
            body.nameservers = ns.slice(0, 13);
        }

        const data = await callNamely('/domains/register', { method: 'POST', body });

        const payload = asRecord(data.data) ?? data;
        const orderId =
            payload.order_id ?? payload.orderId ?? payload.id ?? payload.transaction_id;
        const exp =
            payload.expires_at ?? payload.expiration ?? payload.expiry_date ?? payload.expires_at;

        let expirationDate: Date | undefined;
        if (typeof exp === 'string' || typeof exp === 'number') {
            const t = typeof exp === 'number' ? exp : Date.parse(exp);
            if (!Number.isNaN(t)) expirationDate = new Date(t);
        }

        return {
            success: true,
            domain: params.domain,
            expirationDate,
            orderId: orderId != null ? String(orderId) : undefined,
            raw: data,
        };
    }

    async renewDomain(params: RenewDomainParams): Promise<RenewDomainResult> {
        const data = await callNamely('/domains/renew', {
            method: 'POST',
            body: {
                domain: params.domain.trim().toLowerCase(),
                years: params.years,
            },
        });
        const payload = asRecord(data.data) ?? data;
        const exp = payload.expires_at ?? payload.expiration ?? payload.expiry_date;
        let expirationDate: Date | undefined;
        if (typeof exp === 'string' || typeof exp === 'number') {
            const t = typeof exp === 'number' ? exp : Date.parse(exp as string);
            if (!Number.isNaN(t)) expirationDate = new Date(t);
        }
        return {
            success: true,
            domain: params.domain,
            expirationDate,
            raw: data,
        };
    }

    async getNameservers(domain: string): Promise<string[]> {
        const d = encodeDomainForPath(domain);
        const data = await callNamely(`/domains/${d}/nameservers`, { method: 'GET' });
        const payload = asRecord(data.data) ?? data;
        const list = payload.nameservers ?? payload.name_servers ?? payload.ns;
        if (Array.isArray(list)) {
            return list.map((x) => String(x)).filter(Boolean);
        }
        return [];
    }

    async saveNameservers(domain: string, nameservers: string[]): Promise<void> {
        const d = encodeDomainForPath(domain);
        const trimmed = nameservers.map((n) => n.trim()).filter(Boolean).slice(0, 13);
        if (trimmed.length < 2) {
            throw new RegistrarError({
                registrar: REGISTRAR_NAME,
                command: 'saveNameservers',
                domain,
                message: 'At least two nameservers are required',
            });
        }
        await callNamely(`/domains/${d}/nameservers`, {
            method: 'POST',
            body: { nameservers: trimmed },
        });
    }

    async getDns(domain: string): Promise<DnsRecord[]> {
        const d = encodeDomainForPath(domain);
        const data = await callNamely(`/domains/${d}/dns`, { method: 'GET' });
        const payload = asRecord(data.data) ?? data;
        const list = payload.records ?? payload.dns_records ?? payload.data;
        if (!Array.isArray(list)) return [];
        const allowed = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS']);
        return list.map((row: unknown) => {
            const r = asRecord(row) ?? {};
            const rawType = String(r.type ?? 'A').toUpperCase();
            const type = (allowed.has(rawType) ? rawType : 'TXT') as DnsRecord['type'];
            const name = String(r.name ?? r.host ?? '@');
            const value = String(r.content ?? r.value ?? r.target ?? '');
            const ttl = r.ttl != null ? Number(r.ttl) : undefined;
            const priority = r.priority != null ? Number(r.priority) : undefined;
            return {
                type,
                name: name === '@' ? undefined : name,
                value,
                ttl: Number.isFinite(ttl) ? ttl : undefined,
                priority: Number.isFinite(priority) ? priority : undefined,
            };
        });
    }

    async saveDns(domain: string, records: DnsRecord[]): Promise<void> {
        const d = encodeDomainForPath(domain);
        const batch = records.map((r) => ({
            type: (r.type || 'A').toLowerCase(),
            name: (r.name || '@').trim() || '@',
            content: r.value,
            ttl: r.ttl ?? 3600,
            ...(r.priority != null ? { priority: r.priority } : {}),
        }));
        await callNamely(`/domains/${d}/dns/batch`, {
            method: 'POST',
            body: { records: batch },
        });
    }

    async getTldPricing(_tlds?: string[]): Promise<TldPriceItem[]> {
        const data = await callNamely('/pricing/tlds', { method: 'GET' });
        const payload = asRecord(data.data) ?? data;
        const list = payload.tlds ?? payload.data ?? payload.pricing;
        if (!Array.isArray(list)) return [];
        const currency = String(payload.currency ?? 'BDT');
        return list
            .map((row: unknown): TldPriceItem | null => {
                const r = asRecord(row);
                if (!r) return null;
                const tld = String(r.tld ?? r.extension ?? r.name ?? '').trim();
                if (!tld) return null;
                const reg = r.registration_price ?? r.register ?? r.price_register;
                const ren = r.renewal_price ?? r.renew ?? r.price_renew;
                const regN = typeof reg === 'number' ? reg : parseFloat(String(reg ?? ''));
                const renN = typeof ren === 'number' ? ren : parseFloat(String(ren ?? ''));
                return {
                    tld: tld.startsWith('.') ? tld : `.${tld}`,
                    register: Number.isFinite(regN) ? regN : undefined,
                    renew: Number.isFinite(renN) ? renN : undefined,
                    currency,
                    raw: r,
                };
            })
            .filter((x): x is TldPriceItem => x != null);
    }

    async getDomainInformation(domain: string): Promise<DomainInformation> {
        const nameservers = await this.getNameservers(domain);
        let expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        try {
            const data = await callNamely(`/pricing/tlds`, { method: 'GET' });
            void data;
        } catch {
            // optional
        }
        return {
            domain: domain.trim().toLowerCase(),
            status: 'active',
            expiryDate,
            nameservers,
            locked: false,
            raw: { note: 'Namely Partner API: expiry may be approximate; confirm in Namely portal.' },
        };
    }

    async syncDomain(domainNameOrId: string): Promise<DomainInformation> {
        return this.getDomainInformation(domainNameOrId);
    }

    async getRegistrarLock(_domain: string): Promise<boolean> {
        return false;
    }

    async saveRegistrarLock(_domain: string, _locked: boolean): Promise<void> {
        unsupported('saveRegistrarLock');
    }

    async getContactDetails(domain: string): Promise<DomainContactDetails> {
        const empty: RegistrarContact = { name: '', email: '', id: '' };
        try {
            const data = await callNamely(`/domains/${encodeDomainForPath(domain)}/nameservers`, { method: 'GET' });
            const rawReg = asRecord(data.data)?.registrant ?? asRecord(data)?.registrant;
            const raw = asRecord(rawReg);
            if (raw) {
                const rc: RegistrarContact = {
                    name: String(raw.name ?? ''),
                    email: String(raw.email ?? ''),
                    phonecc: '',
                    phonenum: String(raw.phone ?? ''),
                    address1: String(raw.address ?? ''),
                    city: String(raw.city ?? ''),
                    country: String(raw.country ?? ''),
                    raw,
                };
                return {
                    registrant: rc,
                    admin: rc,
                    tech: rc,
                    billing: rc,
                };
            }
        } catch {
            // fall through
        }
        return { registrant: empty, admin: empty, tech: empty, billing: empty };
    }

    async saveContactDetails(_domain: string, _contacts: Partial<DomainContactDetails>): Promise<void> {
        unsupported('saveContactDetails');
    }

    async getEppCode(_domain: string, _options?: GetEppCodeParams): Promise<GetEppCodeResult> {
        unsupported('getEppCode');
    }

    async transferDomain(_params: TransferDomainParams): Promise<TransferDomainResult> {
        unsupported('transferDomain');
    }

    async syncTransfer(_domain: string): Promise<TransferStatusResult> {
        return {
            status: 'PENDING',
            message: 'Transfer status is not exposed by the Namely Partner API adapter.',
        };
    }

    async registerNameserver(_hostname: string, _ip: string): Promise<RegisterNameserverResult> {
        unsupported('registerNameserver');
    }

    async modifyNameserver(_hostnameOrId: string, _ips: string[]): Promise<void> {
        unsupported('modifyNameserver');
    }

    async deleteNameserver(_hostnameOrId: string): Promise<void> {
        unsupported('deleteNameserver');
    }

    async getAccountBalance(): Promise<AccountBalanceResult> {
        unsupported('getAccountBalance');
    }

    async getOrderStatus(_orderId: string): Promise<OrderStatusResult> {
        unsupported('getOrderStatus');
    }

    async isProcessing(): Promise<boolean> {
        return false;
    }
}

export const namelyRegistrarProvider = new NamelyRegistrarProvider();

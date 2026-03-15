/**
 * Dynadot registrar provider – WHMCS-style function map using Dynadot API3 (api3.json).
 * Maps each registrar capability to Dynadot command(s). Never exposes API key.
 */

import { callDynadot } from './dynadot-api3';
import type {
    IRegistrarProvider,
    DomainAvailabilityResult,
    RegisterDomainParams,
    RegisterDomainResult,
    TransferDomainParams,
    TransferDomainResult,
    TransferStatusResult,
    RenewDomainParams,
    RenewDomainResult,
    DomainInformation,
    DomainContactDetails,
    RegistrarContact,
    DnsRecord,
    GetEppCodeParams,
    GetEppCodeResult,
    RegisterNameserverResult,
    TldPriceItem,
    AccountBalanceResult,
    OrderStatusResult,
} from '../registrar/registrar.types';
import { RegistrarError } from '../registrar/registrar.types';

const REGISTRAR_NAME = 'dynadot';

function parseMsDate(ms: string | number | undefined): Date | undefined {
    if (ms === undefined || ms === null) return undefined;
    const n = typeof ms === 'string' ? parseInt(ms, 10) : ms;
    if (Number.isNaN(n)) return undefined;
    return new Date(n);
}

export class DynadotRegistrarProvider implements IRegistrarProvider {
    readonly name = REGISTRAR_NAME;

    // ---------- A) CheckAvailability -> search ----------
    async checkAvailability(domains: string[]): Promise<DomainAvailabilityResult[]> {
        const params: Record<string, string> = { show_price: '1', currency: 'USD' };
        domains.slice(0, 100).forEach((d, i) => { params[`domain${i}`] = d; });
        const data = await callDynadot('search', params);
        const wrapper = Object.values(data)[0] as Record<string, unknown> | undefined;
        const list = (wrapper?.SearchResults ?? wrapper?.SearchResultList) as Array<{ DomainName?: string; Available?: string; Price?: string }> | undefined;
        if (!Array.isArray(list)) {
            return domains.map((d) => ({ domain: d, available: false }));
        }
        const byDomain = new Map<string, DomainAvailabilityResult>();
        for (const item of list) {
            const domain = item.DomainName || '';
            const available = (item.Available || '').toLowerCase() === 'yes';
            const priceStr = item.Price || '';
            const priceMatch = priceStr.match(/[\d.]+/);
            byDomain.set(domain, {
                domain,
                available,
                price: priceMatch ? parseFloat(priceMatch[0]) : undefined,
                currency: 'USD',
                premium: /premium/i.test(priceStr),
                raw: item as Record<string, unknown>,
            });
        }
        return domains.map((d) => byDomain.get(d) ?? { domain: d, available: false });
    }

    // ---------- B) RegisterDomain -> register ----------
    async registerDomain(params: RegisterDomainParams): Promise<RegisterDomainResult> {
        const body: Record<string, string | number> = {
            domain: params.domain,
            duration: params.years,
            currency: params.currency || 'USD',
        };
        if (params.registrantContactId != null) body.registrant_contact = params.registrantContactId;
        if (params.adminContactId != null) body.admin_contact = params.adminContactId;
        if (params.technicalContactId != null) body.technical_contact = params.technicalContactId;
        if (params.billingContactId != null) body.billing_contact = params.billingContactId;
        if (params.coupon) body.coupon = params.coupon;
        const data = await callDynadot('register', body);
        const wrapper = Object.values(data)[0] as Record<string, unknown> | undefined;
        const exp = wrapper?.Expiration ?? wrapper?.ExpirationDate;
        const orderId = wrapper?.OrderId ?? wrapper?.order_id;
        return {
            success: true,
            domain: params.domain,
            expirationDate: parseMsDate(exp as string | number),
            orderId: orderId != null ? String(orderId) : undefined,
            raw: data,
        };
    }

    // ---------- C) TransferDomain -> transfer ----------
    async transferDomain(params: TransferDomainParams): Promise<TransferDomainResult> {
        const body: Record<string, string> = {
            domain: params.domain,
            auth: params.authCode,
            currency: params.currency || 'USD',
        };
        if (params.registrantContactId != null) body.registrant_contact = params.registrantContactId;
        if (params.adminContactId != null) body.admin_contact = params.adminContactId;
        if (params.technicalContactId != null) body.technical_contact = params.technicalContactId;
        if (params.billingContactId != null) body.billing_contact = params.billingContactId;
        if (params.coupon) body.coupon = params.coupon;
        const data = await callDynadot('transfer', body);
        const wrapper = Object.values(data)[0] as Record<string, unknown> | undefined;
        const orderId = wrapper?.OrderId ?? wrapper?.order_id;
        return {
            success: true,
            domain: params.domain,
            orderId: orderId != null ? String(orderId) : undefined,
            raw: data,
        };
    }

    async getTransferStatus(domain: string): Promise<TransferStatusResult> {
        const data = await callDynadot('get_transfer_status', { domain, transfer_type: 'in' });
        const list = (data.GetTransferStatusResponse as Record<string, unknown>)?.TransferList as Array<{ OrderId?: string; TransferStatus?: string }> | undefined;
        const first = Array.isArray(list) ? list[0] : null;
        const status = first?.TransferStatus ?? 'none';
        const normalized: TransferStatusResult['status'] =
            status === 'waiting' ? 'WAITING' :
                status === 'auth code needed' || status === 'auth_code_needed' ? 'AUTH_CODE_NEEDED' :
                    /completed|approved|success/i.test(status) ? 'COMPLETED' :
                        /reject|cancel|deny|fail/i.test(status) ? 'REJECTED' : 'PENDING';
        return {
            status: normalized,
            orderId: first?.OrderId,
            message: status,
            raw: data,
        };
    }

    async cancelTransfer(domain: string, orderId?: string): Promise<void> {
        const params: Record<string, string> = { domain };
        if (orderId) params.order_id = orderId;
        await callDynadot('cancel_transfer', params);
    }

    // ---------- D) RenewDomain -> renew ----------
    async renewDomain(params: RenewDomainParams): Promise<RenewDomainResult> {
        const body: Record<string, string | number> = {
            domain: params.domain,
            duration: params.years,
            currency: params.currency || 'USD',
        };
        if (params.currentExpiryYear != null) body.year = params.currentExpiryYear;
        if (params.coupon) body.coupon = params.coupon;
        if (params.skipIfLateFee) body.no_renew_if_late_renew_fee_needed = 1;
        const data = await callDynadot('renew', body);
        const wrapper = Object.values(data)[0] as Record<string, unknown> | undefined;
        const exp = wrapper?.Expiration ?? wrapper?.ExpirationDate;
        return {
            success: true,
            domain: params.domain,
            expirationDate: parseMsDate(exp as string | number),
            raw: data,
        };
    }

    // ---------- E) GetDomainInformation -> domain_info ----------
    async getDomainInformation(domain: string): Promise<DomainInformation> {
        const data = await callDynadot('domain_info', { domain });
        const resp = data.DomainInfoResponse as Record<string, unknown> | undefined;
        const info = resp?.DomainInfo as Record<string, unknown> | undefined;
        if (!info) {
            throw new RegistrarError({ registrar: REGISTRAR_NAME, command: 'domain_info', domain, message: 'No domain info in response' });
        }
        const exp = parseMsDate(info.Expiration as string | number);
        const reg = parseMsDate(info.Registration as string | number);
        const whois = info.Whois as Record<string, { ContactId?: string }> | undefined;
        const nsSettings = info.NameServerSettings as Record<string, unknown> | undefined;
        let nameservers: string[] = [];
        if (nsSettings && typeof nsSettings === 'object' && !Array.isArray(nsSettings)) {
            const nsList = (info as any).NameServers ?? (info as any).NameServerList ?? [];
            if (Array.isArray(nsList)) nameservers = nsList.filter((n: unknown) => typeof n === 'string');
        }
        const nsFromGet = await this.getNameserversFromGetNs(domain);
        if (nsFromGet.length > 0) nameservers = nsFromGet;

        const contacts: DomainInformation['contacts'] = whois ? {
            registrant: whois.Registrant ? { id: String((whois.Registrant as any).ContactId ?? '') } : undefined,
            admin: whois.Admin ? { id: String((whois.Admin as any).ContactId ?? '') } : undefined,
            tech: whois.Technical ? { id: String((whois.Technical as any).ContactId ?? '') } : undefined,
            billing: whois.Billing ? { id: String((whois.Billing as any).ContactId ?? '') } : undefined,
        } : undefined;

        return {
            domain: (info.Name as string) || domain,
            status: (info.Status as string) || 'active',
            expiryDate: exp || new Date(),
            registrationDate: reg,
            nameservers,
            contacts,
            locked: (info.Locked as string)?.toLowerCase() === 'yes',
            privacy: info.Privacy as string,
            hold: (info.Hold as string)?.toLowerCase() === 'yes',
            disabled: (info.Disabled as string)?.toLowerCase() === 'yes',
            renewOption: info.RenewOption as string,
            raw: info,
        };
    }

    private async getNameserversFromGetNs(domain: string): Promise<string[]> {
        try {
            const data = await callDynadot('get_ns', { domain });
            const resp = data.GetNsResponse as Record<string, unknown> | undefined;
            const content = resp?.NsContent as Record<string, unknown> | undefined;
            if (!content) return [];
            const hosts = Object.entries(content)
                .filter(([key, value]) => /^Host\d+$/i.test(key) && typeof value === 'string')
                .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                .map(([, value]) => String(value));
            if (hosts.length > 0) return hosts;
        } catch {
            // get_ns may not exist or differ; domain_info may have NS in another field
        }
        return [];
    }

    // ---------- F) GetNameservers ----------
    async getNameservers(domain: string): Promise<string[]> {
        const info = await this.getDomainInformation(domain);
        if (info.nameservers.length > 0) return info.nameservers;
        return this.getNameserversFromGetNs(domain);
    }

    // ---------- G) SaveNameservers -> set_ns ----------
    async saveNameservers(domain: string, nameservers: string[]): Promise<void> {
        const trimmed = nameservers.map((n) => n.trim()).filter(Boolean).slice(0, 13);
        if (trimmed.length < 2) throw new RegistrarError({ registrar: REGISTRAR_NAME, command: 'set_ns', domain, message: 'At least 2 nameservers required' });
        await this.inspectAccountNameservers(trimmed);
        const params: Record<string, string> = { domain };
        trimmed.forEach((n, i) => { params[`ns${i}`] = n; });
        try {
            await callDynadot('set_ns', params);
        } catch (error: any) {
            throw error;
        }
    }

    private async inspectAccountNameservers(nameservers: string[]): Promise<void> {
        const entries = await this.listAccountNameserverEntries();
        const existing = entries.map((entry) => entry.ServerName).filter((value): value is string => typeof value === 'string');
        const existingSet = new Set(existing.map((ns) => ns.toLowerCase()));
        const missing = nameservers.filter((hostname) => !existingSet.has(hostname.toLowerCase()));
        const matchedEntries = entries.filter((entry) => {
            const serverName = entry.ServerName;
            return typeof serverName === 'string' && nameservers.some((hostname) => hostname.toLowerCase() === serverName.toLowerCase());
        });
    }

    private async listAccountNameserverEntries(): Promise<Array<Record<string, unknown>>> {
        try {
            const data = await callDynadot('server_list', {});
            const list = (data.ServerListResponse as Record<string, unknown> | undefined)?.ServerList as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(list)) return [];
            return list;
        } catch {
            return [];
        }
    }

    // ---------- H) GetRegistrarLock (from domain_info) ----------
    async getRegistrarLock(domain: string): Promise<boolean> {
        const info = await this.getDomainInformation(domain);
        return info.locked;
    }

    // ---------- I) SaveRegistrarLock -> lock_domain (lock only; unlock not documented) ----------
    async saveRegistrarLock(domain: string, locked: boolean): Promise<void> {
        if (!locked) {
            throw new RegistrarError({
                registrar: REGISTRAR_NAME,
                command: 'saveRegistrarLock',
                domain,
                message: 'Unlock domain is not supported by this registrar adapter; only lock is implemented.',
            });
        }
        await callDynadot('lock_domain', { domain });
    }

    // ---------- J) GetContactDetails (domain_info + get_contact) ----------
    async getContactDetails(domain: string): Promise<DomainContactDetails> {
        const info = await this.getDomainInformation(domain);
        const whois = info.contacts;
        const empty: RegistrarContact = {};
        const registrantId = whois?.registrant?.id;
        const adminId = whois?.admin?.id;
        const techId = whois?.tech?.id;
        const billingId = whois?.billing?.id;

        const [reg, admin, tech, bill] = await Promise.all([
            registrantId ? this.getRegistrarContact(registrantId) : Promise.resolve(empty),
            adminId ? this.getRegistrarContact(adminId) : Promise.resolve(empty),
            techId ? this.getRegistrarContact(techId) : Promise.resolve(empty),
            billingId ? this.getRegistrarContact(billingId) : Promise.resolve(empty),
        ]);

        return {
            registrant: reg.id ? reg : empty,
            admin: admin.id ? admin : empty,
            tech: tech.id ? tech : empty,
            billing: bill.id ? bill : empty,
        };
    }

    async getRegistrarContact(contactId: string): Promise<RegistrarContact> {
        const data = await callDynadot('get_contact', { contact_id: contactId });
        const content = (data.GetContactResponse as Record<string, unknown> | undefined)?.GetContact as Record<string, unknown> | undefined;
        if (!content) return { id: contactId };
        return this.normalizeContact(content, contactId);
    }

    private normalizeContact(c: Record<string, unknown>, id?: string): RegistrarContact {
        return {
            id: id ?? (c.contact_id ?? c.ContactId) as string,
            organization: (c.organization ?? c.Organization) as string,
            name: (c.name ?? c.Name) as string,
            email: (c.email ?? c.Email) as string,
            phonecc: (c.phonecc ?? c.PhoneCc) as string,
            phonenum: (c.phonenum ?? c.PhoneNum) as string,
            faxcc: (c.faxcc ?? c.FaxCc) as string,
            faxnum: (c.faxnum ?? c.FaxNum) as string,
            address1: (c.address1 ?? c.Address1) as string,
            address2: (c.address2 ?? c.Address2) as string,
            city: (c.city ?? c.City) as string,
            state: (c.state ?? c.State) as string,
            zip: (c.zip ?? c.Zip ?? c.ZipCode) as string,
            country: (c.country ?? c.Country) as string,
            raw: c,
        };
    }

    async listRegistrarContacts(): Promise<RegistrarContact[]> {
        const data = await callDynadot('contact_list', {});
        const list = (data.ContactListResponse as Record<string, unknown>)?.ContactList as Record<string, unknown>[] | undefined;
        if (!Array.isArray(list)) return [];
        return list.map((c, i) => this.normalizeContact(c, (c.contact_id ?? c.ContactId ?? String(i)) as string));
    }

    async createRegistrarContact(local: RegistrarContact): Promise<string> {
        const params: Record<string, string> = {};
        if (local.organization != null) params.organization = local.organization;
        if (local.name != null) params.name = local.name;
        if (local.email != null) params.email = local.email;
        if (local.phonecc != null) params.phonecc = local.phonecc;
        if (local.phonenum != null) params.phonenum = local.phonenum;
        if (local.faxcc != null) params.faxcc = local.faxcc;
        if (local.faxnum != null) params.faxnum = local.faxnum;
        if (local.address1 != null) params.address1 = local.address1;
        if (local.address2 != null) params.address2 = local.address2;
        if (local.city != null) params.city = local.city;
        if (local.state != null) params.state = local.state;
        if (local.zip != null) params.zip = local.zip;
        if (local.country != null) params.country = local.country;
        const data = await callDynadot('create_contact', params);
        const content = (data.CreateContactResponse as Record<string, unknown> | undefined)?.CreateContactContent as Record<string, unknown> | undefined;
        const id = (content?.ContactId ?? content?.contact_id ?? content?.Id) as string | undefined;
        if (!id) throw new RegistrarError({ registrar: REGISTRAR_NAME, command: 'create_contact', message: 'No contact id in response' });
        return String(id);
    }

    async updateRegistrarContact(contactId: string, local: RegistrarContact): Promise<void> {
        const params: Record<string, string> = { contact_id: contactId };
        if (local.organization != null) params.organization = local.organization;
        if (local.name != null) params.name = local.name;
        if (local.email != null) params.email = local.email;
        if (local.phonecc != null) params.phonecc = local.phonecc;
        if (local.phonenum != null) params.phonenum = local.phonenum;
        if (local.faxcc != null) params.faxcc = local.faxcc;
        if (local.faxnum != null) params.faxnum = local.faxnum;
        if (local.address1 != null) params.address1 = local.address1;
        if (local.address2 != null) params.address2 = local.address2;
        if (local.city != null) params.city = local.city;
        if (local.state != null) params.state = local.state;
        if (local.zip != null) params.zip = local.zip;
        if (local.country != null) params.country = local.country;
        await callDynadot('edit_contact', params);
    }

    // ---------- K) SaveContactDetails -> set_whois (contact ids) ----------
    async saveContactDetails(domain: string, contacts: Partial<DomainContactDetails>): Promise<void> {
        const reg = contacts.registrant?.id ?? '0';
        const admin = contacts.admin?.id ?? reg;
        const tech = contacts.tech?.id ?? reg;
        const billing = contacts.billing?.id ?? reg;
        await callDynadot('set_whois', { domain, registrant_contact: reg, admin_contact: admin, technical_contact: tech, billing_contact: billing });
    }

    // ---------- L) GetDNS -> get_dns ----------
    async getDns(domain: string): Promise<DnsRecord[]> {
        const data = await callDynadot('get_dns', { domain });
        const content = (data.GetDnsResponse as Record<string, unknown> | undefined)?.GetDns as Record<string, unknown> | undefined;
        const records: DnsRecord[] = [];
        if (!content) return records;
        const mainTypes = (content.main_record_type0 !== undefined) ? collectIndexed(content, 'main_record_type', 'main_record', 'main_recordx') : [];
        const subTypes = (content.sub_record_type0 !== undefined) ? collectIndexed(content, 'sub_record_type', 'sub_record', 'sub_recordx', 'subdomain') : [];
        for (const [type, value, priority, sub] of mainTypes) {
            records.push({ type: (type as DnsRecord['type']) || 'A', value: value || '', priority, name: sub || undefined });
        }
        for (const [type, value, priority, sub] of subTypes) {
            records.push({ type: (type as DnsRecord['type']) || 'A', value: value || '', priority, name: sub || undefined });
        }
        return records;
    }

    // ---------- M) SaveDNS -> set_dns2 ----------
    async saveDns(domain: string, records: DnsRecord[]): Promise<void> {
        const params: Record<string, string> = { domain };
        let mainIdx = 0;
        let subIdx = 0;
        for (const r of records) {
            const type = (r.type || 'A').toLowerCase();
            const name = (r.name || '').trim();
            if (!name || name === '@' || name === '') {
                params[`main_record_type${mainIdx}`] = type;
                params[`main_record${mainIdx}`] = r.value;
                if (r.priority != null) params[`main_recordx${mainIdx}`] = String(r.priority);
                mainIdx++;
            } else {
                params[`subdomain${subIdx}`] = name;
                params[`sub_record_type${subIdx}`] = type;
                params[`sub_record${subIdx}`] = r.value;
                if (r.priority != null) params[`sub_recordx${subIdx}`] = String(r.priority);
                subIdx++;
            }
        }
        if (mainIdx > 0 || subIdx > 0) await callDynadot('set_dns2', params);
    }

    // ---------- N) GetEPPCode -> get_transfer_auth_code ----------
    async getEppCode(domain: string, options?: GetEppCodeParams): Promise<GetEppCodeResult> {
        const params: Record<string, string> = { domain };
        if (options?.newCode) params.new_code = '1';
        if (options?.unlockForTransfer) params.unlock_domain_for_transfer = '1';
        const data = await callDynadot('get_transfer_auth_code', params);
        const wrapper = Object.values(data)[0] as Record<string, unknown> | undefined;
        const code = (wrapper?.AuthCode ?? wrapper?.auth_code) as string | undefined;
        return { eppCode: code || '', raw: data };
    }

    // ---------- O) RegisterNameserver -> register_ns or add_ns ----------
    async registerNameserver(hostname: string, ip: string): Promise<RegisterNameserverResult> {
        await callDynadot('register_ns', { ns_name: hostname, ns_ip: ip });
        return { success: true, hostname };
    }

    // ---------- P) ModifyNameserver -> set_ns_ip ----------
    async modifyNameserver(hostnameOrId: string, ips: string[]): Promise<void> {
        const params: Record<string, string> = { ns_name: hostnameOrId };
        ips.forEach((ip, i) => { params[i === 0 ? 'ns_ip' : `ns_ip${i}`] = ip; });
        await callDynadot('set_ns_ip', params);
    }

    // ---------- Q) DeleteNameserver -> delete_ns ----------
    async deleteNameserver(hostnameOrId: string): Promise<void> {
        await callDynadot('delete_ns', { ns_name: hostnameOrId });
    }

    // ---------- R) Sync -> domain_info ----------
    async syncDomain(domainNameOrId: string): Promise<DomainInformation> {
        return this.getDomainInformation(domainNameOrId);
    }

    // ---------- S) TransferSync -> get_transfer_status ----------
    async syncTransfer(domain: string): Promise<TransferStatusResult> {
        return this.getTransferStatus(domain);
    }

    // ---------- T) GetTldPricing -> tld_price ----------
    async getTldPricing(_tlds?: string[]): Promise<TldPriceItem[]> {
        const params: Record<string, string> = { currency: 'USD' };
        const data = await callDynadot('tld_price', params);
        const content = (data.TldPriceResponse as Record<string, unknown> | undefined) ?? {};
        const list = content?.TldPriceList ?? content?.tld_list ?? (Array.isArray(content) ? content : null);
        if (!list || !Array.isArray(list)) return [];
        const currency = (content?.currency as string) || 'USD';
        return list.map((t: any) => ({
            tld: t.Tld ?? t.tld ?? t.extension ?? '',
            register: t.Register ?? t.register,
            renew: t.Renew ?? t.renew,
            transfer: t.Transfer ?? t.transfer,
            currency,
            raw: t,
        })).filter((t: TldPriceItem) => t.tld);
    }

    // ---------- Extra ----------
    async getAccountBalance(): Promise<AccountBalanceResult> {
        const data = await callDynadot('get_account_balance', {});
        const content = (data.GetAccountBalanceResponse as Record<string, unknown> | undefined)?.GetAccountBalanceContent as Record<string, unknown> | undefined;
        const balance = (content?.balance ?? content?.Balance ?? 0) as number;
        const currency = (content?.currency ?? content?.Currency ?? 'USD') as string;
        return { balance, currency, raw: data };
    }

    async getOrderStatus(orderId: string): Promise<OrderStatusResult> {
        const data = await callDynadot('get_order_status', { order_id: orderId });
        const content = (data.GetOrderStatusResponse as Record<string, unknown> | undefined)?.GetOrderStatusContent as Record<string, unknown> | undefined;
        const status = (content?.status ?? content?.Status ?? '') as string;
        return { orderId, status, raw: data };
    }

    async listDomains(): Promise<{ domain: string; [k: string]: unknown }[]> {
        const data = await callDynadot('list_domain', {});
        const list = (data.ListDomainResponse as Record<string, unknown>)?.DomainList as any[] | undefined
            ?? (data.ListDomainInfoResponse as Record<string, unknown>)?.DomainList as any[] | undefined;
        if (!Array.isArray(list)) return [];
        return list.map((d) => ({ domain: d.Domain ?? d.Name ?? d.domain ?? '', ...d }));
    }

    async isProcessing(): Promise<boolean> {
        try {
            const data = await callDynadot('is_processing', {});
            const content = (data.IsProcessingResponse as Record<string, unknown> | undefined)?.IsProcessingContent as Record<string, unknown> | undefined;
            return (content?.processing ?? content?.Processing ?? 0) === 1;
        } catch {
            return false;
        }
    }
}

function collectIndexed(
    content: Record<string, unknown>,
    typePrefix: string,
    valuePrefix: string,
    priorityPrefix: string,
    subPrefix?: string
): [string, string, number | undefined, string | undefined][] {
    const out: [string, string, number | undefined, string | undefined][] = [];
    let i = 0;
    while (content[`${typePrefix}${i}`] !== undefined) {
        const type = content[`${typePrefix}${i}`] as string;
        const value = content[`${valuePrefix}${i}`] as string;
        const priority = content[`${priorityPrefix}${i}`] as number | string | undefined;
        const sub = subPrefix ? (content[`${subPrefix}${i}`] as string) : undefined;
        out.push([type, value, priority != null ? Number(priority) : undefined, sub]);
        i++;
    }
    return out;
}

export const dynadotRegistrarProvider = new DynadotRegistrarProvider();

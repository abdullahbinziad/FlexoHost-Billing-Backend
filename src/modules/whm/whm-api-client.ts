import fetch, { Response } from 'node-fetch';
import https from 'https';
import http from 'http';
import config from '../../config';

export interface WhmApiClientOptions {
    hostname: string;
    port?: number;
    useSSL?: boolean;
    username: string;
    apiToken: string;
    timeoutMs?: number;
    /** When true (default), verify TLS certificates. Set false only for self-signed certs in trusted environments. */
    rejectUnauthorized?: boolean;
}

/**
 * Reusable WHM API client for a single server.
 * Uses WHM username + API token only (no password). Authorization: whm user:token
 */
export class WhmApiClient {
    private readonly baseUrl: string;
    private readonly authHeader: string;
    private readonly timeoutMs: number;
    private readonly agent: https.Agent | http.Agent;

    constructor(options: WhmApiClientOptions) {
        const port = options.port ?? (options.useSSL !== false ? 2087 : 2086);
        const protocol = options.useSSL !== false ? 'https' : 'http';
        const hostname = (options.hostname || '')
            .replace(/^https?:\/\//i, '')
            .replace(/\/.*$/, '')
            .split('/')[0]
            .trim()
            .toLowerCase();
        this.baseUrl = hostname ? `${protocol}://${hostname}:${port}` : '';
        this.authHeader = `whm ${options.username.trim()}:${options.apiToken.trim()}`;
        this.timeoutMs = options.timeoutMs ?? config.whm.httpTimeoutMs;
        const rejectUnauthorized = options.rejectUnauthorized !== false;
        this.agent = options.useSSL !== false
            ? new https.Agent({ rejectUnauthorized })
            : new http.Agent();
    }

    /**
     * Raw WHM JSON API request.
     */
    async request(command: string, params: Record<string, any> = {}): Promise<any> {
        const query = new URLSearchParams({
            ...params,
            'api.version': '1',
        }).toString();
        const url = `${this.baseUrl}/json-api/${command}?${query}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const res: Response = await fetch(url, {
                method: 'GET',
                headers: { Authorization: this.authHeader },
                agent: this.agent as any,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data: any = await res.json();

            if (data.metadata && data.metadata.result === 0) {
                throw new Error(data.metadata.reason || 'WHM API Error');
            }
            if (data.cpanelresult && data.cpanelresult.error) {
                throw new Error(data.cpanelresult.error || data.cpanelresult.data?.reason || 'WHM API Error');
            }
            if (data.result && data.result.status === 0) {
                throw new Error(data.result.statusmsg || 'WHM API Error');
            }

            return data;
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('WHM request timed out');
            }
            throw err;
        }
    }

    /** WHM API 1 returns payload in data.data; some versions use top-level. Normalize. */
    private payload<T = any>(data: any): T {
        return (data?.data !== undefined ? data.data : data) as T;
    }

    /** Test connection (e.g. listaccts with limit 1 or version). */
    async testConnection(): Promise<{ success: true; message?: string; [k: string]: any }> {
        const data = await this.request('version');
        return { success: true, message: 'Connected', version: data?.version };
    }

    /**
     * List WHM hosting packages (WHM API1 /listpkgs).
     * The docs show nested response variants; normalize all common shapes to
     * [{ name, ...raw }] so callers can reliably read package names.
     */
    async listPackages(): Promise<Array<{ name: string; [k: string]: any }>> {
        const data = await this.request('listpkgs');
        const p = this.payload<any>(data);

        const rawList =
            p?.package ||
            p?.packages ||
            p?.pkg ||
            p?.pkgs ||
            data?.data?.package ||
            data?.data?.packages ||
            data?.data?.pkg ||
            data?.data?.pkgs ||
            [];

        // Array form: [{ name: "basic" }, ...] OR [{ pkg: "basic" }, ...]
        if (Array.isArray(rawList)) {
            return rawList
                .map((item: any) => {
                    const name = String(item?.name || item?.pkg || item?.package || '').trim();
                    if (!name) return null;
                    return { name, ...item };
                })
                .filter(Boolean) as Array<{ name: string; [k: string]: any }>;
        }

        // Object map form: { basic: {...}, pro: {...} }
        if (rawList && typeof rawList === 'object') {
            return Object.entries(rawList).map(([key, value]) => {
                const valueObj = value && typeof value === 'object' ? value : {};
                const nestedName = String((valueObj as any).name || '').trim();
                const name = nestedName || key;
                return { name, ...(valueObj as Record<string, unknown>) };
            });
        }

        return [];
    }

    /** List cPanel accounts on this server (for capacity / fill-until-full). */
    async listAccounts(): Promise<any[]> {
        const data = await this.request('listaccts');
        const p = this.payload<{ acct?: any[] }>(data);
        const acct = p?.acct;
        return Array.isArray(acct) ? acct : acct ? [acct] : [];
    }

    /**
     * Get disk and bandwidth usage for a cPanel account via WHM accountsummary API.
     * Uses GET /json-api/accountsummary?user=username (and api.version=1).
     * Returns used/limit in MB; limit 0 means unlimited or not reported.
     * See: https://api.docs.cpanel.net/specifications/whm.openapi/account-management/accountsummary
     */
    async getAccountUsage(username: string): Promise<{ disk: { usedMb: number; limitMb: number }; bandwidth: { usedMb: number; limitMb: number } }> {
        const data = await this.request('accountsummary', { user: username });
        const p = this.payload<{ acct?: any[] | any }>(data);
        let accts = p?.acct;
        if (!Array.isArray(accts)) accts = accts ? [accts] : [];
        const acct = accts[0];
        if (!acct) {
            return {
                disk: { usedMb: 0, limitMb: 0 },
                bandwidth: { usedMb: 0, limitMb: 0 },
            };
        }
        const diskused = parseDiskMb(acct.diskused);
        const disklimit = parseLimitMb(acct.disklimit);
        const bwused = parseDiskMb(acct.bandwidth);
        const bwlimit = parseLimitMb(acct.bwlimit);
        return {
            disk: { usedMb: Math.round(diskused), limitMb: Math.round(disklimit) },
            bandwidth: { usedMb: Math.round(bwused), limitMb: Math.round(bwlimit) },
        };
    }

    async createAccount(payload: { username: string; domain: string; plan: string; email: string; password?: string }) {
        const params: Record<string, any> = {
            username: payload.username,
            domain: payload.domain,
            plan: payload.plan,
            contactemail: payload.email,
            spf: 1,
            dkim: 1,
            spamassassin: 1,
            hasshell: 0,
            ip: 'n',
        };
        if (payload.password) {
            params.password = payload.password;
        }
        return this.request('createacct', params);
    }

    async suspendAccount(username: string, reason: string = 'Overdue Invoice') {
        return this.request('suspendacct', { user: username, reason });
    }

    async unsuspendAccount(username: string) {
        return this.request('unsuspendacct', { user: username });
    }

    async terminateAccount(username: string) {
        return this.request('removeacct', { user: username });
    }

    async changePackage(username: string, plan: string) {
        return this.request('changepackage', { user: username, pkg: plan });
    }

    async changePassword(username: string, password: string) {
        return this.request('passwd', { user: username, password });
    }

    async verifyUsername(username: string) {
        return this.request('verify_new_username', { user: username });
    }

    /**
     * Create an email mailbox for a cPanel account (runs cPanel API 2 Email::addpop as the user).
     * WHM /json-api/cpanel?cpanel_jsonapi_user=...&cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Email&cpanel_jsonapi_func=addpop
     */
    async createEmailMailbox(
        cpanelUsername: string,
        domain: string,
        emailLocalPart: string,
        password: string,
        quotaMb: number = 250
    ): Promise<void> {
        const params: Record<string, any> = {
            cpanel_jsonapi_user: cpanelUsername,
            cpanel_jsonapi_apiversion: 2,
            cpanel_jsonapi_module: 'Email',
            cpanel_jsonapi_func: 'addpop',
            domain: domain,
            email: emailLocalPart.trim().toLowerCase(),
            password: password,
            quota: Math.max(0, Math.min(quotaMb, 1024)),
        };
        await this.request('cpanel', params);
    }

    /**
     * Get available cPanel appkeys for a user (Jupiter theme links).
     * GET /json-api/get_users_links?api.version=1&user=CPANEL_USERNAME&service=cpaneld
     * Returns object whose keys are the official Jupiter appkeys (e.g. Email_Accounts, Backups_Home).
     */
    async getUsersLinks(cpanelUsername: string, service: 'cpaneld' = 'cpaneld'): Promise<Record<string, string>> {
        const data = await this.request('get_users_links', {
            user: cpanelUsername,
            service,
        });
        const p = this.payload<Record<string, string>>(data);
        if (p && typeof p === 'object' && !Array.isArray(p)) {
            return p;
        }
        return {};
    }

    /**
     * Create a temporary login session for a cPanel user (SSO).
     * - cPanel: service='cpaneld', optional app=AppKey for direct app (e.g. Backup, Passwd).
     * - Webmail: service='webmaild', no app.
     * Returns URL to redirect the client to.
     */
    async createUserSession(
        cpanelUsername: string,
        service: 'cpaneld' | 'webmaild',
        app?: string | null
    ): Promise<string> {
        const params: Record<string, string> = {
            user: cpanelUsername,
            service,
        };
        if (app && app.trim()) params.app = app.trim();
        const data = await this.request('create_user_session', params);
        const p = this.payload<{ url?: string }>(data);
        const url = p?.url || (data as any)?.url;
        if (!url || typeof url !== 'string') {
            throw new Error('WHM did not return a login URL');
        }
        return url;
    }
}

/** Parse accountsummary diskused: can be "14M" (MiB) or number. */
function parseDiskMb(v: any): number {
    if (v == null) return 0;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    const s = String(v).trim().replace(/\s/g, '');
    const match = s.match(/^(\d+(?:\.\d+)?)\s*M?$/i);
    return match ? Number(match[1]) : 0;
}

/** Parse limit (disklimit/bwlimit): "2048M", number, or "unlimited" (-> 0). */
function parseLimitMb(v: any): number {
    if (v == null) return 0;
    if (String(v).toLowerCase() === 'unlimited') return 0;
    const parsed = parseDiskMb(v);
    if (parsed > 0) return parsed;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
}

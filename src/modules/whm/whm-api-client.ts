import fetch, { Response } from 'node-fetch';
import https from 'https';
import http from 'http';

export interface WhmApiClientOptions {
    hostname: string;
    port?: number;
    useSSL?: boolean;
    username: string;
    apiToken: string;
    timeoutMs?: number;
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
        this.timeoutMs = options.timeoutMs ?? 30000;
        this.agent = options.useSSL !== false
            ? new https.Agent({ rejectUnauthorized: false })
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

    /** Test connection (e.g. listaccts with limit 1 or version). */
    async testConnection(): Promise<{ success: true; message?: string; [k: string]: any }> {
        const data = await this.request('version');
        return { success: true, message: 'Connected', version: data?.version };
    }

    /** List WHM packages (for product linking). */
    async listPackages(): Promise<any[]> {
        const data = await this.request('listpkgs');
        return data?.package || [];
    }

    /** List cPanel accounts on this server (for capacity / fill-until-full). */
    async listAccounts(): Promise<any[]> {
        const data = await this.request('listaccts');
        return data?.acct || [];
    }

    async createAccount(payload: { username: string; domain: string; plan: string; email: string }) {
        return this.request('createacct', {
            username: payload.username,
            domain: payload.domain,
            plan: payload.plan,
            contactemail: payload.email,
            spf: 1,
            dkim: 1,
            spamassassin: 1,
            hasshell: 0,
            ip: 'n',
        });
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

    async verifyUsername(username: string) {
        return this.request('verify_new_username', { user: username });
    }

    /**
     * Create a temporary login session for a cPanel user (SSO).
     * service: 'cpaneld' for cPanel, 'webmail' for Webmail (if supported).
     * Returns URL to redirect the client to.
     */
    async createUserSession(cpanelUsername: string, service: 'cpaneld' | 'webmail' = 'cpaneld'): Promise<string> {
        const data = await this.request('create_user_session', {
            user: cpanelUsername,
            service,
        });
        const url = data?.url || data?.data?.url;
        if (!url || typeof url !== 'string') {
            throw new Error('WHM did not return a login URL');
        }
        return url;
    }
}

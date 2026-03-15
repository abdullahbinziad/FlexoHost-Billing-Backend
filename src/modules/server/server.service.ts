import Server from './server.model';
import { IServer } from './server.interface';
import ApiError from '../../utils/apiError';
import { encrypt, decrypt, isEncrypted } from '../../utils/encryption';
import { WhmApiClient } from '../whm/whm-api-client';

/** Normalize server for API: groups array + never expose token/password. */
function normalizeServerForApi(doc: any): any {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    const groups = Array.isArray(obj.groups) && obj.groups.length > 0
        ? obj.groups
        : (obj.group ? [obj.group] : ['Web Hosting']);
    if (obj.module) {
        const hasToken = !!obj.module.apiToken;
        const hasPassword = !!obj.module.password;
        delete obj.module.apiToken;
        delete obj.module.password;
        obj.module = { ...obj.module, hasApiToken: hasToken, hasPassword };
    }
    return { ...obj, groups };
}

class ServerService {
    private encryptTokenIfNeeded(module: any): any {
        if (!module) return module;
        const m = { ...module };
        if (m.apiToken && typeof m.apiToken === 'string' && !isEncrypted(m.apiToken)) {
            m.apiToken = encrypt(m.apiToken);
        }
        return m;
    }

    /**
     * Get server by ID with decrypted API token (for WHM operations). Do not expose response to client.
     */
    async getServerByIdWithToken(id: string): Promise<any | null> {
        const server = await Server.findById(id).select('+module.apiToken').lean();
        if (!server) return null;
        const obj = { ...server };
        if (obj.module?.apiToken) {
            obj.module = { ...obj.module };
            const token = String(obj.module.apiToken);
            try {
                obj.module.apiToken = isEncrypted(token) ? decrypt(token) : token;
            } catch {
                obj.module.apiToken = '';
            }
        }
        return obj;
    }

    /**
     * Build WHM client for a server (uses decrypted token).
     */
    async getWhmClient(serverId: string): Promise<WhmApiClient | null> {
        const server = await this.getServerByIdWithToken(serverId);
        if (!server?.module?.username || !server?.module?.apiToken) return null;
        return new WhmApiClient({
            hostname: server.hostname,
            port: server.module.port ?? 2087,
            useSSL: server.module.isSecure !== false,
            username: server.module.username,
            apiToken: server.module.apiToken,
            rejectUnauthorized: server.module.rejectUnauthorized !== false,
        });
    }

    /**
     * Get WHM client or a clear error message for order/run-module-create.
     */
    async getWhmClientOrError(serverId: string): Promise<{ client: WhmApiClient } | { error: string }> {
        const server = await Server.findById(serverId).select('name hostname module').lean();
        if (!server) {
            return { error: 'Server not found. Check that the selected server exists.' };
        }
        const withToken = await this.getServerByIdWithToken(serverId);
        if (!withToken?.module?.username) {
            return { error: `Server "${(server as any).name}" has no WHM username. Set it in Admin → Servers → Edit server → Module.` };
        }
        if (!withToken?.module?.apiToken || (withToken.module.apiToken as string).trim() === '') {
            return { error: `Server "${(server as any).name}" has no WHM API token. Add token in Admin → Servers → Edit server → Module (API Token).` };
        }
        const client = await this.getWhmClient(serverId);
        if (!client) {
            return { error: `Server "${(server as any).name}": could not build WHM client (check ENCRYPTION_KEY if token was saved encrypted).` };
        }
        return { client };
    }

    async createServer(serverData: Partial<IServer>, createdBy?: string): Promise<any> {
        if (await Server.findOne({ hostname: serverData.hostname })) {
            throw new ApiError(409, 'Hostname already exists');
        }
        const payload: any = { ...serverData };
        if (payload.group != null) delete payload.group;
        if (!Array.isArray(payload.groups) || payload.groups.length === 0) {
            payload.groups = ['Web Hosting'];
        }
        if (payload.module) {
            payload.module = this.encryptTokenIfNeeded(payload.module);
        }
        if (createdBy) payload.createdBy = createdBy;
        const server = await Server.create(payload);
        return normalizeServerForApi(server);
    }

    async getServers(filter: any = {}): Promise<any[]> {
        const list = await Server.find(filter).sort({ createdAt: -1 });
        return list.map(normalizeServerForApi);
    }

    async getServerById(id: string): Promise<any | null> {
        const server = await Server.findById(id);
        return server ? normalizeServerForApi(server) : null;
    }

    async updateServer(id: string, updateData: Partial<IServer>, _actorId?: string): Promise<any | null> {
        const payload: any = { ...updateData };
        if (payload.group != null) delete payload.group;
        if (payload.module) {
            const token = payload.module.apiToken;
            if (token === undefined || (typeof token === 'string' && token.trim() === '')) {
                const existing = await Server.findById(id).select('+module.apiToken').lean();
                if (existing?.module?.apiToken) {
                    payload.module.apiToken = existing.module.apiToken;
                } else {
                    delete payload.module.apiToken;
                }
            }
            payload.module = this.encryptTokenIfNeeded(payload.module);
        }
        const server = await Server.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
        return server ? normalizeServerForApi(server) : null;
    }

    async deleteServer(id: string): Promise<IServer | null> {
        return Server.findByIdAndDelete(id);
    }

    /**
     * Test WHM connection for a server. Updates lastConnectionCheckAt and lastConnectionStatus.
     */
    async testWhmConnection(serverId: string): Promise<{ success: boolean; message?: string; error?: string; [k: string]: any }> {
        const client = await this.getWhmClient(serverId);
        if (!client) {
            await Server.findByIdAndUpdate(serverId, {
                lastConnectionCheckAt: new Date(),
                lastConnectionStatus: 'failed',
            });
            return { success: false, error: 'Server not found or missing WHM credentials (username + API token)' };
        }
        try {
            const result = await client.testConnection();
            await Server.findByIdAndUpdate(serverId, {
                lastConnectionCheckAt: new Date(),
                lastConnectionStatus: 'success',
            });
            return result;
        } catch (err: any) {
            await Server.findByIdAndUpdate(serverId, {
                lastConnectionCheckAt: new Date(),
                lastConnectionStatus: 'failed',
            });
            return { success: false, error: err?.message || 'Connection failed' };
        }
    }

    /**
     * Fetch package list from WHM for a server.
     */
    async listWhmPackages(serverId: string): Promise<{ packages: any[]; error?: string }> {
        const client = await this.getWhmClient(serverId);
        if (!client) {
            return { packages: [], error: 'Server not found or missing WHM credentials' };
        }
        try {
            const packages = await client.listPackages();
            return { packages: packages || [] };
        } catch (err: any) {
            return { packages: [], error: err?.message || 'Failed to list packages' };
        }
    }

    /**
     * Get current cPanel account count for a server (via WHM listaccts).
     */
    async getWhmAccountCount(serverId: string): Promise<{ count: number; error?: string }> {
        const client = await this.getWhmClient(serverId);
        if (!client) {
            return { count: 0, error: 'Server not found or missing WHM credentials' };
        }
        try {
            const accts = await client.listAccounts();
            return { count: Array.isArray(accts) ? accts.length : 0 };
        } catch (err: any) {
            return { count: 0, error: err?.message || 'Failed to list accounts' };
        }
    }

    /**
     * Sync account count from WHM for a cPanel server. Updates server.accountCount and accountCountSyncedAt; returns count and max for display.
     */
    async syncAccountCount(serverId: string): Promise<{ count: number; maxAccounts: number; syncedAt: string } | { error: string }> {
        const server = await Server.findById(serverId).lean();
        if (!server) {
            return { error: 'Server not found' };
        }
        const moduleType = (server as any).module?.type;
        if (moduleType !== 'cpanel') {
            return { error: 'Account sync is only available for cPanel servers' };
        }
        const { count, error } = await this.getWhmAccountCount(serverId);
        if (error) {
            return { error };
        }
        const now = new Date();
        await Server.findByIdAndUpdate(serverId, {
            accountCount: count,
            accountCountSyncedAt: now,
        });
        const maxAccounts = (server as any).maxAccounts ?? 200;
        return { count, maxAccounts, syncedAt: now.toISOString() };
    }
}

export const serverService = new ServerService();

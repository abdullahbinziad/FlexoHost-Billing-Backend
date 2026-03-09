import Server from './server.model';
import { IServer } from './server.interface';
import ApiError from '../../utils/apiError';

/** Normalize server for API: always return groups array (from groups or legacy group). */
function normalizeServer(doc: any): any {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    const groups = Array.isArray(obj.groups) && obj.groups.length > 0
        ? obj.groups
        : (obj.group ? [obj.group] : ['Web Hosting']);
    return { ...obj, groups };
}

class ServerService {
    /**
     * Create a new server
     */
    async createServer(serverData: Partial<IServer>): Promise<IServer> {
        if (await Server.findOne({ hostname: serverData.hostname })) {
            throw new ApiError(409, 'Hostname already exists');
        }
        const payload: any = { ...serverData };
        if (payload.group != null) delete payload.group;
        if (!Array.isArray(payload.groups) || payload.groups.length === 0) {
            payload.groups = ['Web Hosting'];
        }
        const server = await Server.create(payload);
        return normalizeServer(server);
    }

    /**
     * Get all servers
     */
    async getServers(filter: any = {}): Promise<IServer[]> {
        const list = await Server.find(filter).sort({ createdAt: -1 });
        return list.map(normalizeServer);
    }

    /**
     * Get server by ID
     */
    async getServerById(id: string): Promise<IServer | null> {
        const server = await Server.findById(id);
        return server ? normalizeServer(server) : null;
    }

    /**
     * Update server
     */
    async updateServer(id: string, updateData: Partial<IServer>): Promise<IServer | null> {
        const payload: any = { ...updateData };
        if (payload.group != null) delete payload.group;
        const server = await Server.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
        return server ? normalizeServer(server) : null;
    }

    /**
     * Delete server
     */
    async deleteServer(id: string): Promise<IServer | null> {
        return Server.findByIdAndDelete(id);
    }
}

export const serverService = new ServerService();

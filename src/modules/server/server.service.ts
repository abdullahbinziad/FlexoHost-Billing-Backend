import Server from './server.model';
import { IServer } from './server.interface';
import ApiError from '../../utils/apiError';

class ServerService {
    /**
     * Create a new server
     */
    async createServer(serverData: Partial<IServer>): Promise<IServer> {
        // Check if hostname exists
        if (await Server.findOne({ hostname: serverData.hostname })) {
            throw new ApiError(409, 'Hostname already exists');
        }

        const server = await Server.create(serverData);
        return server;
    }

    /**
     * Get all servers
     * @param options Filtering and pagination
     */
    async getServers(filter: any = {}): Promise<IServer[]> {
        return Server.find(filter).sort({ createdAt: -1 });
    }

    /**
     * Get server by ID
     */
    async getServerById(id: string): Promise<IServer | null> {
        return Server.findById(id);
    }

    /**
     * Update server
     */
    async updateServer(id: string, updateData: Partial<IServer>): Promise<IServer | null> {
        return Server.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    }

    /**
     * Delete server
     */
    async deleteServer(id: string): Promise<IServer | null> {
        return Server.findByIdAndDelete(id);
    }
}

export const serverService = new ServerService();

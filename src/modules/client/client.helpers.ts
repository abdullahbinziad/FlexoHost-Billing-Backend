import Client from './client.model';

/**
 * Resolve the client ID for the current user.
 * Uses user.clientId if set, otherwise looks up Client by user._id.
 * Reusable across client, grant, and service controllers.
 */
export async function getClientIdForUser(user: { _id: any; clientId?: any }): Promise<string | null> {
    if (user.clientId) return user.clientId.toString();
    const client = await Client.findOne({ user: user._id }).select('_id').lean();
    return client ? (client._id as any).toString() : null;
}

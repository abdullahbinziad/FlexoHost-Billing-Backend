import mongoose from 'mongoose';
import ClientAccessGrant from './client-access-grant.model';
import Client from '../client/client.model';
import User from '../user/user.model';
import Service from '../services/service.model';
import type {
    GrantScope,
    GrantPermission,
    GrantAccessResult,
    IClientAccessGrantDocument,
} from './client-access-grant.interface';
export interface CreateGrantParams {
    clientId: string;
    createdByUserId: string;
    granteeEmail: string;
    scope: GrantScope;
    serviceType?: string;
    serviceIds?: string[];
    permissions: GrantPermission[];
    expiresAt?: Date;
    allowInvoices?: boolean;
    allowTickets?: boolean;
    allowOrders?: boolean;
}

export class ClientAccessGrantService {
    /**
     * Create a grant. Resolves grantee by email. Caller must ensure createdByUserId is the client owner.
     */
    async create(params: CreateGrantParams): Promise<IClientAccessGrantDocument> {
        const grantee = await User.findOne({ email: params.granteeEmail.toLowerCase(), active: true }).select('_id').lean();
        if (!grantee) throw new Error('User with this email not found or inactive');
        const granteeUserId = (grantee as any)._id;

        const client = await Client.findById(params.clientId).select('_id user').lean();
        if (!client) throw new Error('Client not found');
        if ((client as any).user?.toString() !== params.createdByUserId) throw new Error('Only the client owner can create grants');

        if (params.scope === 'service_type' && !params.serviceType) throw new Error('serviceType required when scope is service_type');
        if (params.scope === 'specific_services' && (!params.serviceIds || params.serviceIds.length === 0))
            throw new Error('serviceIds required when scope is specific_services');

        const existing = await ClientAccessGrant.findOne({
            clientId: params.clientId,
            granteeUserId,
            expiresAt: { $exists: true, $ne: null, $gt: new Date() },
        }).lean();
        if (existing) throw new Error('This user already has an active grant for this client. Revoke it first or update expiry.');

        const doc: any = {
            clientId: params.clientId,
            granteeUserId,
            createdByUserId: params.createdByUserId,
            scope: params.scope,
            permissions: params.permissions || ['view'],
            allowInvoices: params.allowInvoices !== false,
            allowTickets: params.allowTickets !== false,
            allowOrders: params.allowOrders !== false,
        };
        if (params.scope === 'service_type') doc.serviceType = params.serviceType;
        if (params.scope === 'specific_services') doc.serviceIds = (params.serviceIds || []).map((id) => new mongoose.Types.ObjectId(id));
        if (params.expiresAt) doc.expiresAt = new Date(params.expiresAt);

        const grant = await ClientAccessGrant.create(doc);
        return grant;
    }

    /** Update an existing grant (owner only). Grantee cannot be changed. */
    async update(
        grantId: string,
        clientId: string,
        requestedByUserId: string,
        updates: {
            scope?: GrantScope;
            serviceType?: string;
            serviceIds?: string[];
            permissions?: GrantPermission[];
            allowInvoices?: boolean;
            allowTickets?: boolean;
            allowOrders?: boolean;
            expiresAt?: Date | null;
        }
    ): Promise<IClientAccessGrantDocument> {
        const client = await Client.findById(clientId).select('user').lean();
        if (!client) throw new Error('Client not found');
        if ((client as any).user?.toString() !== requestedByUserId) throw new Error('Only the client owner can update grants');

        const grant = await ClientAccessGrant.findOne({ _id: grantId, clientId });
        if (!grant) throw new Error('Grant not found');

        if (updates.scope !== undefined) {
            grant.scope = updates.scope;
            if (updates.scope === 'service_type') {
                grant.serviceType = updates.serviceType ?? undefined;
                grant.serviceIds = undefined;
            } else if (updates.scope === 'specific_services') {
                grant.serviceIds = (updates.serviceIds || []).map((id) => new mongoose.Types.ObjectId(id));
                grant.serviceType = undefined;
            } else {
                grant.serviceType = undefined;
                grant.serviceIds = undefined;
            }
        } else {
            if (updates.serviceType !== undefined) grant.serviceType = updates.serviceType;
            if (updates.serviceIds !== undefined) grant.serviceIds = updates.serviceIds?.map((id) => new mongoose.Types.ObjectId(id));
        }
        if (updates.permissions !== undefined) grant.permissions = updates.permissions;
        if (updates.allowInvoices !== undefined) grant.allowInvoices = updates.allowInvoices;
        if (updates.allowTickets !== undefined) grant.allowTickets = updates.allowTickets;
        if (updates.allowOrders !== undefined) grant.allowOrders = updates.allowOrders;
        if (updates.expiresAt !== undefined) grant.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : undefined;

        if (grant.scope === 'service_type' && !grant.serviceType) throw new Error('serviceType required when scope is service_type');
        if (grant.scope === 'specific_services' && (!grant.serviceIds || grant.serviceIds.length === 0))
            throw new Error('serviceIds required when scope is specific_services');

        await grant.save();
        return grant;
    }

    async listByClient(clientId: string): Promise<IClientAccessGrantDocument[]> {
        const list = await ClientAccessGrant.find({ clientId })
            .populate('granteeUserId', 'email firstName lastName')
            .populate('createdByUserId', 'email')
            .sort({ createdAt: -1 })
            .lean()
            .exec();
        return list as unknown as IClientAccessGrantDocument[];
    }

    async listByGrantee(granteeUserId: string): Promise<IClientAccessGrantDocument[]> {
        const now = new Date();
        const list = await ClientAccessGrant.find({
            granteeUserId,
            $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
        })
            .populate('clientId', 'firstName lastName companyName contactEmail')
            .populate('createdByUserId', 'email')
            .sort({ createdAt: -1 })
            .lean()
            .exec();
        return list as unknown as IClientAccessGrantDocument[];
    }

    async revoke(grantId: string, clientId: string, requestedByUserId: string): Promise<void> {
        const client = await Client.findById(clientId).select('user').lean();
        if (!client) throw new Error('Client not found');
        if ((client as any).user?.toString() !== requestedByUserId) throw new Error('Only the client owner can revoke grants');
        const result = await ClientAccessGrant.deleteOne({ _id: grantId, clientId });
        if (result.deletedCount === 0) throw new Error('Grant not found or already revoked');
    }

    /**
     * Check if userId can access clientId, optionally restricted to a specific service and permission.
     */
    async checkAccess(
        userId: string,
        clientId: string,
        options?: { serviceId?: string; serviceType?: string; requiredPermission?: GrantPermission }
    ): Promise<GrantAccessResult> {
        const client = await Client.findById(clientId).select('user').lean();
        if (!client) return { allowed: false, isOwner: false, isGrantee: false };

        const ownerId = (client as any).user?.toString();
        if (ownerId === userId) {
            return { allowed: true, isOwner: true, isGrantee: false, permissions: ['view', 'manage'] };
        }

        const now = new Date();
        const grants = await ClientAccessGrant.find({
            clientId,
            granteeUserId: userId,
            $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
        }).lean();

        // When checking by serviceId only, resolve service type so service_type grants can match
        let resolvedServiceType: string | undefined = options?.serviceType;
        if (options?.serviceId && !resolvedServiceType) {
            const service = await Service.findOne({
                _id: options.serviceId,
                clientId,
            })
                .select('type')
                .lean();
            if (service) resolvedServiceType = (service as any).type;
        }

        let mergedAllowInvoices = false;
        let mergedAllowTickets = false;
        let mergedAllowOrders = false;
        let firstMatch: GrantAccessResult | null = null;

        for (const g of grants) {
            const grant = g as any;
            let matches = false;
            if (!options?.serviceId) matches = true;
            else if (grant.scope === 'all') matches = true;
            else if (grant.scope === 'service_type' && resolvedServiceType && String(grant.serviceType).toUpperCase() === String(resolvedServiceType).toUpperCase()) matches = true;
            else if (grant.scope === 'service_type' && options?.serviceId) matches = false;
            else if (grant.scope === 'specific_services' && options?.serviceId) {
                const ids = (grant.serviceIds || []).map((x: any) => x?.toString?.());
                if (ids.includes(options.serviceId)) matches = true;
            }
            if (matches) {
                const perms = grant.permissions || ['view'];
                const required = options?.requiredPermission || 'view';
                const hasPermission = perms.includes(required) || (required === 'view' && perms.includes('manage'));
                if (hasPermission) {
                    mergedAllowInvoices = mergedAllowInvoices || grant.allowInvoices !== false;
                    mergedAllowTickets = mergedAllowTickets || grant.allowTickets !== false;
                    mergedAllowOrders = mergedAllowOrders || grant.allowOrders !== false;
                    if (!firstMatch) {
                        const allowedServiceIds = grant.scope === 'specific_services' ? (grant.serviceIds || []).map((x: any) => x?.toString?.()) : undefined;
                        const allowedServiceType = grant.scope === 'service_type' ? grant.serviceType : undefined;
                        firstMatch = {
                            allowed: true,
                            isOwner: false,
                            isGrantee: true,
                            allowedServiceIds,
                            allowedServiceType,
                            permissions: perms,
                            allowInvoices: grant.allowInvoices !== false,
                            allowTickets: grant.allowTickets !== false,
                            allowOrders: grant.allowOrders !== false,
                        };
                    }
                }
            }
        }
        if (firstMatch) {
            firstMatch.allowInvoices = mergedAllowInvoices;
            firstMatch.allowTickets = mergedAllowTickets;
            firstMatch.allowOrders = mergedAllowOrders;
            return firstMatch;
        }
        return { allowed: false, isOwner: false, isGrantee: false };
    }

    /**
     * Returns filter to apply when listing services for a grantee: { serviceIds } and/or { types } or null (all).
     * Merges all active grants for this user+client.
     */
    async getServiceFilterForGrantee(userId: string, clientId: string): Promise<{ serviceIds?: string[]; types?: string[] } | null> {
        const client = await Client.findById(clientId).select('user').lean();
        if (!client) return null;
        if ((client as any).user?.toString() === userId) return null; // owner sees all

        const now = new Date();
        const grants = await ClientAccessGrant.find({
            clientId,
            granteeUserId: userId,
            $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
        }).lean();

        let allServiceIds: Set<string> = new Set();
        let allTypes: Set<string> = new Set();
        let hasAll = false;
        for (const g of grants) {
            const grant = g as any;
            if (grant.scope === 'all') hasAll = true;
            else if (grant.scope === 'service_type' && grant.serviceType)
                allTypes.add(String(grant.serviceType).toUpperCase());
            else if (grant.scope === 'specific_services' && grant.serviceIds?.length)
                grant.serviceIds.forEach((x: any) => allServiceIds.add(x?.toString?.()));
        }
        if (hasAll) return null;
        const out: { serviceIds?: string[]; types?: string[] } = {};
        if (allServiceIds.size) out.serviceIds = Array.from(allServiceIds);
        if (allTypes.size) out.types = Array.from(allTypes);
        if (Object.keys(out).length === 0) return null;
        return out;
    }
}

export const clientAccessGrantService = new ClientAccessGrantService();

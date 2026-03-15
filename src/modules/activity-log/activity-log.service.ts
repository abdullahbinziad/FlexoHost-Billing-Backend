import ActivityLog from './activity-log.model';
import { IActivityLogDocument, ActorType, ActivityCategory } from './activity-log.interface';
import { buildSort, getPagination } from '../../utils/pagination';
import { escapeRegex } from '../../utils/escapeRegex';
import Client from '../client/client.model';

export interface LogActivityParams {
    message: string;
    clientId?: string;
    userId?: string;
    ipAddress?: string;
    actorType?: ActorType;
    category?: ActivityCategory;
    meta?: Record<string, unknown>;
}

/**
 * Append an entry to the system activity log (legacy). Prefer auditLog() for new code.
 * Safe to call from anywhere (auth, cron, jobs).
 */
export async function logActivity(params: LogActivityParams): Promise<IActivityLogDocument> {
    const doc = await ActivityLog.create({
        message: params.message,
        clientId: params.clientId,
        userId: params.userId,
        ipAddress: params.ipAddress,
        actorType: params.actorType ?? 'system',
        category: params.category ?? 'other',
        meta: params.meta,
    });
    return doc;
}

export { auditLog, auditLogSafe } from './audit-log.service';
export type { AuditLogParams } from './audit-log.service';

export interface GetActivityLogFilters {
    search?: string;
    clientId?: string;
    userId?: string;
    actorType?: ActorType;
    category?: ActivityCategory;
    type?: string;
    source?: string;
    severity?: string;
    invoiceId?: string;
    serviceId?: string;
    ticketId?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface GetActivityLogOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface GetActivityLogResult {
    results: IActivityLogDocument[];
    page: number;
    limit: number;
    totalPages: number;
    totalResults: number;
}

export async function getActivityLogs(
    filters: GetActivityLogFilters,
    options: GetActivityLogOptions = {}
): Promise<GetActivityLogResult> {
    const { page = 1, limit = 100, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const { skip, limit: safeLimit, page: safePage } = getPagination({ page, limit, maxLimit: 500 });
    const sort = buildSort(sortBy, sortOrder);

    const query: Record<string, unknown> = {};

    if (filters.clientId) {
        const clientContext: Array<Record<string, unknown>> = [{ clientId: filters.clientId }];
        const client = await Client.findById(filters.clientId).select('user').lean();
        const clientUserId = (client as { user?: { toString(): string } | string } | null)?.user;

        if (clientUserId) {
            clientContext.push({ userId: clientUserId });
            clientContext.push({ actorId: clientUserId });
        }

        query.$or = clientContext;
    }
    if (filters.userId) query.userId = filters.userId;
    if (filters.actorType) query.actorType = filters.actorType;
    if (filters.category) query.category = filters.category;
    if (filters.type) query.type = filters.type;
    if (filters.source) query.source = filters.source;
    if (filters.severity) query.severity = filters.severity;
    if (filters.invoiceId) query.invoiceId = filters.invoiceId;
    if (filters.serviceId) query.serviceId = filters.serviceId;
    if (filters.ticketId) query.ticketId = filters.ticketId;
    if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) (query.createdAt as Record<string, Date>).$gte = new Date(filters.dateFrom);
        if (filters.dateTo) (query.createdAt as Record<string, Date>).$lte = new Date(filters.dateTo);
    }
    if (filters.search && filters.search.trim()) {
        query.message = { $regex: escapeRegex(filters.search.trim()), $options: 'i' };
    }
    const finalQuery = query;

    const [results, totalResults] = await Promise.all([
        ActivityLog.find(finalQuery)
            .sort(sort)
            .skip(skip)
            .limit(safeLimit)
            .populate('clientId', 'firstName lastName contactEmail')
            .populate('userId', 'email')
            .populate('actorId', 'email')
            .lean()
            .exec(),
        ActivityLog.countDocuments(finalQuery),
    ]);

    return {
        results: results as unknown as IActivityLogDocument[],
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(totalResults / safeLimit),
        totalResults,
    };
}

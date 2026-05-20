import mongoose from 'mongoose';
import { buildSort, getPagination } from '../../utils/pagination';
import { escapeRegex } from '../../utils/escapeRegex';
import EmailLog, { EmailLogSource, EmailLogStatus, IEmailLog } from './email-log.model';

export interface EmailLogContext {
    clientId?: string;
    serviceId?: string;
    invoiceId?: string;
    domainId?: string;
    orderId?: string;
    ticketId?: string;
    sentBy?: string;
    actorType?: 'system' | 'user';
    source?: EmailLogSource;
    emailType?: string;
    bodyPreview?: string;
    meta?: Record<string, unknown>;
}

export interface CreateEmailLogParams extends EmailLogContext {
    to: string;
    from?: string;
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    subject: string;
    templateKey?: string;
    status: EmailLogStatus;
    providerMessageId?: string;
    error?: string;
}

function toObjectId(value?: string): mongoose.Types.ObjectId | undefined {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) return undefined;
    return new mongoose.Types.ObjectId(value);
}

function preview(value?: string): string | undefined {
    if (!value) return undefined;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned.length > 500 ? `${cleaned.slice(0, 500)}...` : cleaned;
}

export async function createEmailLog(params: CreateEmailLogParams): Promise<IEmailLog | null> {
    try {
        return await EmailLog.create({
            clientId: toObjectId(params.clientId),
            serviceId: toObjectId(params.serviceId),
            invoiceId: toObjectId(params.invoiceId),
            domainId: toObjectId(params.domainId),
            orderId: toObjectId(params.orderId),
            ticketId: toObjectId(params.ticketId),
            sentBy: toObjectId(params.sentBy),
            actorType: params.actorType || (params.sentBy ? 'user' : 'system'),
            source: params.source || 'system',
            status: params.status,
            to: params.to,
            from: params.from,
            cc: params.cc,
            bcc: params.bcc,
            replyTo: params.replyTo,
            subject: params.subject,
            templateKey: params.templateKey,
            emailType: params.emailType,
            bodyPreview: preview(params.bodyPreview),
            providerMessageId: params.providerMessageId,
            error: params.error,
            meta: params.meta,
        });
    } catch {
        return null;
    }
}

export interface GetEmailLogFilters {
    clientId?: string;
    serviceId?: string;
    invoiceId?: string;
    domainId?: string;
    orderId?: string;
    ticketId?: string;
    status?: EmailLogStatus;
    source?: EmailLogSource;
    templateKey?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface GetEmailLogOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export async function getEmailLogs(filters: GetEmailLogFilters, options: GetEmailLogOptions = {}) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const { skip, limit: safeLimit, page: safePage } = getPagination({ page, limit, maxLimit: 100 });
    const query: Record<string, unknown> = {};

    for (const key of ['clientId', 'serviceId', 'invoiceId', 'domainId', 'orderId', 'ticketId'] as const) {
        const id = filters[key];
        if (id && mongoose.Types.ObjectId.isValid(id)) query[key] = id;
    }
    if (filters.status) query.status = filters.status;
    if (filters.source) query.source = filters.source;
    if (filters.templateKey) query.templateKey = filters.templateKey;
    if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) {
            const start = new Date(filters.dateFrom);
            start.setHours(0, 0, 0, 0);
            (query.createdAt as Record<string, Date>).$gte = start;
        }
        if (filters.dateTo) {
            const end = new Date(filters.dateTo);
            end.setHours(23, 59, 59, 999);
            (query.createdAt as Record<string, Date>).$lte = end;
        }
    }
    if (filters.search?.trim()) {
        const regex = { $regex: escapeRegex(filters.search.trim()), $options: 'i' };
        query.$or = [{ subject: regex }, { to: regex }, { bodyPreview: regex }, { templateKey: regex }];
    }

    const [results, totalResults] = await Promise.all([
        EmailLog.find(query)
            .sort(buildSort(sortBy, sortOrder))
            .skip(skip)
            .limit(safeLimit)
            .populate('clientId', 'firstName lastName contactEmail')
            .populate('serviceId', 'serviceNumber type status')
            .populate('invoiceId', 'invoiceNumber status total balanceDue')
            .populate('sentBy', 'email')
            .lean()
            .exec(),
        EmailLog.countDocuments(query),
    ]);

    return {
        results,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(totalResults / safeLimit),
        totalResults,
    };
}

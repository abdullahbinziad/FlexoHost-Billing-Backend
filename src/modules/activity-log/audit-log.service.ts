/**
 * Audit log service: write-only, sanitized activity records for business/security/financial events.
 * Never log secrets, passwords, tokens, card data, or sensitive raw payloads.
 */

import { Types } from 'mongoose';
import ActivityLog from './activity-log.model';
import type {
    IActivityLogDocument,
    ActorType,
    ActivityCategory,
    AuditSource,
    AuditSeverity,
    AuditStatus,
    AuditEventType,
} from './activity-log.interface';

const SENSITIVE_KEYS = new Set([
    'password', 'token', 'accessToken', 'refreshToken', 'secret', 'apiKey', 'api_key',
    'authorization', 'cookie', 'cardNumber', 'cvv', 'cvc', 'card_number', 'cardCvc',
    'ssn', 'creditCard', 'credit_card', 'eppCode', 'epp_code', 'privateKey', 'private_key',
]);

function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!meta || typeof meta !== 'object') return meta;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
        const lower = k.toLowerCase();
        if (SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('secret')) {
            out[k] = '[REDACTED]';
            continue;
        }
        if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            out[k] = sanitizeMeta(v as Record<string, unknown>);
        } else {
            out[k] = v;
        }
    }
    return out;
}

export interface AuditLogParams {
    /** Human-readable description (required). */
    message: string;
    /** Machine-readable event type. */
    type?: AuditEventType;
    category?: ActivityCategory;
    actorType?: ActorType;
    /** User ID when actor is a user (string or ObjectId). */
    actorId?: string | Types.ObjectId;
    targetType?: string;
    targetId?: string | Types.ObjectId;
    source?: AuditSource;
    status?: AuditStatus;
    severity?: AuditSeverity;
    clientId?: string | Types.ObjectId;
    serviceId?: string | Types.ObjectId;
    invoiceId?: string | Types.ObjectId;
    domainId?: string | Types.ObjectId;
    ticketId?: string | Types.ObjectId;
    orderId?: string | Types.ObjectId;
    ipAddress?: string;
    userAgent?: string;
    /** Must not contain secrets; will be sanitized. */
    meta?: Record<string, unknown>;
}

function toObjectId(v: string | Types.ObjectId | undefined): Types.ObjectId | undefined {
    if (v == null) return undefined;
    if (typeof v === 'string') return new Types.ObjectId(v);
    return v as Types.ObjectId;
}

/**
 * Append an audit log entry. Safe to call from anywhere (auth, cron, jobs, controllers).
 * Sanitizes meta to never store passwords, tokens, or card data.
 */
export async function auditLog(params: AuditLogParams): Promise<IActivityLogDocument> {
    const doc: Record<string, unknown> = {
        message: params.message,
        actorType: params.actorType ?? 'system',
        category: params.category ?? 'other',
        type: params.type,
        targetType: params.targetType,
        source: params.source ?? 'system',
        status: params.status ?? 'success',
        severity: params.severity ?? 'low',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        meta: sanitizeMeta(params.meta),
    };

    const actorId = toObjectId(params.actorId);
    if (actorId) {
        doc.actorId = actorId;
        doc.userId = actorId;
    }
    if (params.targetId) doc.targetId = toObjectId(params.targetId);
    if (params.clientId) doc.clientId = toObjectId(params.clientId);
    if (params.serviceId) doc.serviceId = toObjectId(params.serviceId);
    if (params.invoiceId) doc.invoiceId = toObjectId(params.invoiceId);
    if (params.domainId) doc.domainId = toObjectId(params.domainId);
    if (params.ticketId) doc.ticketId = toObjectId(params.ticketId);
    if (params.orderId) doc.orderId = toObjectId(params.orderId);

    const created = await ActivityLog.create(doc);
    return created as IActivityLogDocument;
}

/** Fire-and-forget audit log; never throws. Use when you must not fail the main flow. */
export function auditLogSafe(params: AuditLogParams): void {
    auditLog(params).catch((err) => {
        if (typeof console !== 'undefined' && console.error) {
            console.error('[AuditLog] Failed to write audit entry:', err?.message || err);
        }
    });
}

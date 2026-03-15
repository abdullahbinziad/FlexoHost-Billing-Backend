/**
 * Activity logging for registrar actions. Safe metadata only (no API keys, no raw secrets).
 */

import { auditLogSafe } from '../../activity-log/activity-log.service';
import type { AuditStatus } from '../../activity-log/activity-log.interface';

export type RegistrarEventType =
    | 'domain.search.performed'
    | 'domain.register.requested'
    | 'domain.register.completed'
    | 'domain.register.failed'
    | 'domain.transfer.requested'
    | 'domain.transfer.status_updated'
    | 'domain.renew.completed'
    | 'domain.nameservers_updated'
    | 'domain.contacts_updated'
    | 'domain.dns_updated'
    | 'domain.epp_code_requested'
    | 'domain.sync.completed'
    | 'registrar.dynadot.balance_checked';

export interface RegistrarAuditParams {
    event: RegistrarEventType;
    domain?: string;
    command?: string;
    status?: AuditStatus;
    clientId?: string;
    serviceId?: string;
    actorType?: 'system' | 'user';
    actorId?: string;
    meta?: Record<string, unknown>;
}

export function registrarAudit(params: RegistrarAuditParams): void {
    const { event, domain, command, status, clientId, serviceId, actorType, actorId, meta } = params;
    auditLogSafe({
        message: `Registrar: ${event}${domain ? ` ${domain}` : ''}`,
        category: 'domain',
        actorType: actorType ?? 'system',
        actorId,
        clientId,
        serviceId,
        source: 'system',
        status: status ?? 'success',
        meta: {
            registrarEvent: event,
            domain,
            command,
            status,
            ...meta,
        },
    });
}

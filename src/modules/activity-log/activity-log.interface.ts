import { Document, Model, Types } from 'mongoose';

export type ActorType = 'system' | 'user';

/** Who/what triggered the action: manual (admin/staff), system (app), cron (scheduler), webhook (gateway/external). */
export type AuditSource = 'manual' | 'system' | 'cron' | 'webhook';

/** Filtering category for activity list. */
export type ActivityCategory =
    | 'invoice'
    | 'payment'
    | 'order'
    | 'service'
    | 'affiliate'
    | 'domain'
    | 'ticket'
    | 'auth'
    | 'email'
    | 'cron'
    | 'suspension'
    | 'usage'
    | 'backup'
    | 'settings'
    | 'automation'
    | 'other';

/** Machine-readable event type for querying and alerts. */
export type AuditEventType =
    | 'invoice_created'
    | 'invoice_auto_generated'
    | 'invoice_updated'
    | 'invoice_modified'
    | 'invoice_cancelled'
    | 'invoice_paid'
    | 'invoice_deleted'
    | 'payment_received'
    | 'payment_refunded'
    | 'payment_failed'
    | 'credit_changed'
    | 'order_created'
    | 'order_accepted'
    | 'order_rejected'
    | 'service_created'
    | 'service_activated'
    | 'service_suspended'
    | 'service_unsuspended'
    | 'service_terminated'
    | 'service_cancelled'
    | 'service_renewed'
    | 'hosting_provisioned'
    | 'hosting_suspended'
    | 'hosting_terminated'
    | 'vps_provisioned'
    | 'vps_rebooted'
    | 'vps_suspended'
    | 'vps_terminated'
    | 'vps_reinstalled'
    | 'domain_registered'
    | 'domain_transferred'
    | 'domain_renewed'
    | 'domain_imported'
    | 'domain_nameserver_changed'
    | 'domain_synced'
    | 'ticket_opened'
    | 'ticket_replied'
    | 'ticket_closed'
    | 'ticket_status_changed'
    | 'login_success'
    | 'login_failed'
    | 'password_reset'
    | 'email_verified'
    | 'twofa_changed'
    | 'email_sent'
    | 'email_failed'
    | 'email_account_created'
    | 'settings_changed'
    | 'product_created'
    | 'product_changed'
    | 'server_created'
    | 'server_changed'
    | 'module_created'
    | 'module_changed'
    | 'cron_started'
    | 'cron_completed'
    | 'automation_summary'
    | 'affiliate_joined'
    | 'affiliate_referral_tracked'
    | 'affiliate_commission_created'
    | 'affiliate_commission_reversed'
    | 'affiliate_credit_redeemed'
    | 'affiliate_payout_requested'
    | 'affiliate_payout_approved'
    | 'affiliate_payout_rejected'
    | 'affiliate_payout_paid'
    | 'affiliate_settings_updated'
    | 'role_created'
    | 'role_updated'
    | 'role_deleted'
    | 'role_archived'
    | 'role_restored'
    | 'user_role_assigned'
    | 'other';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AuditStatus = 'success' | 'failure' | 'pending';

export interface IActivityLog {
    /** Human-readable description (required, stored as message for backward compat). */
    message: string;
    /** Machine-readable event type. */
    type?: AuditEventType;
    /** Filter category. */
    category?: ActivityCategory;
    /** Who performed the action: system or user. */
    actorType: ActorType;
    /** User ID when actorType is user (ObjectId). Kept for backward compat; prefer actorId for new logs. */
    userId?: Types.ObjectId;
    /** User ID when actorType is user (ObjectId). */
    actorId?: Types.ObjectId;
    /** Target entity type (e.g. invoice, service, ticket). */
    targetType?: string;
    /** Target entity ID. */
    targetId?: Types.ObjectId;
    /** Origin: manual, system, cron, webhook. */
    source?: AuditSource;
    /** success | failure | pending. */
    status?: AuditStatus;
    /** low | medium | high | critical. */
    severity?: AuditSeverity;
    /** Optional entity IDs for filtering (no secrets). */
    clientId?: Types.ObjectId;
    serviceId?: Types.ObjectId;
    invoiceId?: Types.ObjectId;
    domainId?: Types.ObjectId;
    ticketId?: Types.ObjectId;
    orderId?: Types.ObjectId;
    ipAddress?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
}

export interface IActivityLogDocument extends IActivityLog, Document {
    createdAt: Date;
}

export interface IActivityLogModel extends Model<IActivityLogDocument> {}

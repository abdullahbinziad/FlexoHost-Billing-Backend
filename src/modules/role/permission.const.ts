/**
 * Exhaustive feature permissions for the admin panel.
 * Each permission is a distinct feature – every action, button, and capability is separately assignable.
 * Format: resource:feature
 */

export type PermissionCategory =
    | 'dashboard'
    | 'clients'
    | 'billing'
    | 'infrastructure'
    | 'support'
    | 'settings';

export interface PermissionMeta {
    id: string;
    label: string;
    description?: string;
    category: PermissionCategory;
    riskLevel?: 'low' | 'medium' | 'high';
}

/** All permissions with metadata, grouped by resource */
export const PERMISSION_META: Record<string, PermissionMeta[]> = {
    dashboard: [
        { id: 'dashboard:overview', label: 'View dashboard overview', category: 'dashboard' },
        { id: 'dashboard:daily_actions', label: 'View daily actions list', category: 'dashboard' },
        { id: 'dashboard:daily_actions_details', label: 'View daily action details', category: 'dashboard' },
        { id: 'dashboard:activity_log', label: 'View activity log', category: 'dashboard' },
        { id: 'dashboard:automation', label: 'View automation page', category: 'dashboard' },
        { id: 'dashboard:automation_summary', label: 'View automation summary', category: 'dashboard' },
        { id: 'dashboard:automation_runs', label: 'View automation run history', category: 'dashboard' },
        { id: 'dashboard:jobs_provisioning', label: 'View provisioning jobs', category: 'dashboard' },
        { id: 'dashboard:jobs_provisioning_retry', label: 'Retry provisioning job', category: 'dashboard' },
        { id: 'dashboard:jobs_actions', label: 'View service action jobs', category: 'dashboard' },
        { id: 'dashboard:jobs_actions_retry', label: 'Retry service action job', category: 'dashboard' },
        { id: 'dashboard:trigger_renewals', label: 'Manually trigger renewals', category: 'dashboard' },
        { id: 'dashboard:trigger_overdue_suspensions', label: 'Trigger overdue suspensions', category: 'dashboard' },
        { id: 'dashboard:trigger_invoice_reminders', label: 'Trigger invoice reminders', category: 'dashboard' },
        { id: 'dashboard:trigger_terminations', label: 'Trigger terminations', category: 'dashboard' },
        { id: 'dashboard:trigger_usage_sync', label: 'Trigger usage sync', category: 'dashboard' },
        { id: 'dashboard:trigger_provisioning_worker', label: 'Trigger provisioning worker', category: 'dashboard' },
        { id: 'dashboard:trigger_action_worker', label: 'Trigger action worker', category: 'dashboard' },
        { id: 'dashboard:trigger_domain_sync', label: 'Trigger domain sync', category: 'dashboard' },
        { id: 'dashboard:trigger_task', label: 'Trigger any automation task by key', category: 'dashboard' },
    ],
    clients: [
        { id: 'clients:list', label: 'List/search clients', category: 'clients' },
        { id: 'clients:read', label: 'View client details', category: 'clients' },
        { id: 'clients:update', label: 'Update client', category: 'clients' },
        { id: 'clients:delete', label: 'Delete client (soft)', category: 'clients' },
        { id: 'clients:delete_permanent', label: 'Permanently delete client', category: 'clients', riskLevel: 'high' },
        { id: 'clients:regenerate_support_pin', label: 'Regenerate client support PIN', category: 'clients' },
        { id: 'clients:send_email', label: 'Send email to client', category: 'clients' },
        { id: 'clients:verify_support_pin', label: 'Verify support PIN lookup', category: 'clients' },
        { id: 'clients:access_grants_list', label: 'List access grants', category: 'clients' },
        { id: 'clients:access_grants_create', label: 'Create access grant', category: 'clients' },
        { id: 'clients:access_grants_update', label: 'Update access grant', category: 'clients' },
        { id: 'clients:access_grants_delete', label: 'Revoke access grant', category: 'clients' },
    ],
    users: [
        { id: 'users:list', label: 'List all users', category: 'clients' },
        { id: 'users:read', label: 'View user details', category: 'clients' },
        { id: 'users:update', label: 'Update user', category: 'clients' },
        { id: 'users:delete', label: 'Delete user', category: 'clients' },
        { id: 'users:delete_permanent', label: 'Permanently delete user', category: 'clients', riskLevel: 'high' },
    ],
    affiliates: [
        { id: 'affiliates:dashboard', label: 'View admin affiliate dashboard', category: 'clients' },
        { id: 'affiliates:client_read', label: 'View client affiliate info', category: 'clients' },
        { id: 'affiliates:client_enroll', label: 'Enroll client as affiliate', category: 'clients' },
        { id: 'affiliates:settings_update', label: 'Update default affiliate settings', category: 'clients' },
        { id: 'affiliates:client_settings_update', label: 'Update client affiliate settings', category: 'clients' },
        { id: 'affiliates:client_status_update', label: 'Update client affiliate status', category: 'clients' },
        { id: 'affiliates:payout_review', label: 'Review/approve payout requests', category: 'clients' },
    ],
    orders: [
        { id: 'orders:list', label: 'List orders', category: 'billing' },
        { id: 'orders:read', label: 'View order details', category: 'billing' },
        { id: 'orders:create', label: 'Create order', category: 'billing' },
        { id: 'orders:update_status', label: 'Update order status', category: 'billing' },
        { id: 'orders:run_module_create', label: 'Run module create (provision)', category: 'billing' },
    ],
    invoices: [
        { id: 'invoices:list', label: 'List invoices', category: 'billing' },
        { id: 'invoices:read', label: 'View invoice / PDF', category: 'billing' },
        { id: 'invoices:create', label: 'Create invoice', category: 'billing' },
        { id: 'invoices:update', label: 'Update invoice', category: 'billing' },
        { id: 'invoices:update_status', label: 'Update invoice status', category: 'billing' },
        { id: 'invoices:delete', label: 'Delete invoice', category: 'billing' },
        { id: 'invoices:send_reminder', label: 'Send reminder email', category: 'billing' },
        { id: 'invoices:add_payment', label: 'Add manual payment', category: 'billing' },
        { id: 'invoices:stats', label: 'View invoice dashboard stats', category: 'billing' },
    ],
    transactions: [
        { id: 'transactions:list', label: 'List transactions', category: 'billing' },
        { id: 'transactions:read', label: 'View transaction details', category: 'billing' },
    ],
    products: [
        { id: 'products:list', label: 'List products', category: 'infrastructure' },
        { id: 'products:read', label: 'View product details', category: 'infrastructure' },
        { id: 'products:create', label: 'Create product', category: 'infrastructure' },
        { id: 'products:update', label: 'Update product', category: 'infrastructure' },
        { id: 'products:delete', label: 'Delete product', category: 'infrastructure' },
        { id: 'products:toggle_visibility', label: 'Toggle product visibility', category: 'infrastructure' },
        { id: 'products:search', label: 'Search products', category: 'infrastructure' },
        { id: 'products:duplicate', label: 'Duplicate product', category: 'infrastructure' },
    ],
    tickets: [
        { id: 'tickets:list', label: 'List tickets', category: 'support' },
        { id: 'tickets:read', label: 'View ticket details', category: 'support' },
        { id: 'tickets:create', label: 'Create ticket', category: 'support' },
        { id: 'tickets:reply', label: 'Reply to ticket', category: 'support' },
        { id: 'tickets:update_status', label: 'Update ticket status', category: 'support' },
        { id: 'tickets:resolve', label: 'Mark ticket resolved', category: 'support' },
    ],
    promotions: [
        { id: 'promotions:list', label: 'List promotions', category: 'billing' },
        { id: 'promotions:read', label: 'View promotion details', category: 'billing' },
        { id: 'promotions:create', label: 'Create promotion', category: 'billing' },
        { id: 'promotions:update', label: 'Update promotion', category: 'billing' },
        { id: 'promotions:delete', label: 'Delete promotion', category: 'billing' },
        { id: 'promotions:toggle', label: 'Toggle promotion active', category: 'billing' },
        { id: 'promotions:usage_stats', label: 'View usage stats', category: 'billing' },
    ],
    domains: [
        { id: 'domains:inventory_list', label: 'List all domains (inventory)', category: 'infrastructure' },
        { id: 'domains:client_list', label: 'List domains by client', category: 'infrastructure' },
        { id: 'domains:registrars_read', label: 'View registrar configs', category: 'infrastructure' },
        { id: 'domains:registrars_update', label: 'Update registrar config', category: 'infrastructure' },
        { id: 'domains:sync_bulk', label: 'Bulk sync domains', category: 'infrastructure' },
        { id: 'domains:reconcile', label: 'Reconcile registrar', category: 'infrastructure' },
        { id: 'domains:reconcile_import', label: 'Import from reconcile', category: 'infrastructure' },
        { id: 'domains:sync_by_service', label: 'Sync domain by service', category: 'infrastructure' },
        { id: 'domains:register', label: 'Register new domain', category: 'infrastructure' },
        { id: 'domains:transfer', label: 'Transfer domain', category: 'infrastructure' },
        { id: 'domains:epp', label: 'Get EPP code', category: 'infrastructure' },
        { id: 'domains:lock_read', label: 'Get lock status', category: 'infrastructure' },
        { id: 'domains:lock_update', label: 'Update lock status', category: 'infrastructure' },
        { id: 'domains:contacts_read', label: 'Get contact details', category: 'infrastructure' },
        { id: 'domains:contacts_update', label: 'Update contact details', category: 'infrastructure' },
        { id: 'domains:dns_read', label: 'Get DNS records', category: 'infrastructure' },
        { id: 'domains:dns_update', label: 'Update DNS records', category: 'infrastructure' },
        { id: 'domains:details', label: 'Get domain details', category: 'infrastructure' },
        { id: 'domains:renew', label: 'Renew domain', category: 'infrastructure' },
        { id: 'domains:nameservers_update', label: 'Update nameservers', category: 'infrastructure' },
    ],
    domain_settings: [
        { id: 'domain_settings:list', label: 'List TLDs', category: 'infrastructure' },
        { id: 'domain_settings:read', label: 'View TLD/pricing', category: 'infrastructure' },
        { id: 'domain_settings:create', label: 'Create TLD', category: 'infrastructure' },
        { id: 'domain_settings:update', label: 'Update TLD/pricing', category: 'infrastructure' },
        { id: 'domain_settings:delete', label: 'Delete TLD', category: 'infrastructure' },
        { id: 'domain_settings:defaults_read', label: 'View global domain defaults', category: 'infrastructure' },
        {
            id: 'domain_settings:defaults_update',
            label: 'Update global domain defaults (registrar, nameservers)',
            category: 'infrastructure',
            riskLevel: 'medium',
        },
    ],
    servers: [
        { id: 'servers:list', label: 'List servers', category: 'infrastructure' },
        { id: 'servers:read', label: 'View server details', category: 'infrastructure' },
        { id: 'servers:create', label: 'Create server', category: 'infrastructure' },
        { id: 'servers:update', label: 'Update server', category: 'infrastructure' },
        { id: 'servers:delete', label: 'Delete server', category: 'infrastructure' },
        { id: 'servers:test_connection', label: 'Test server connection', category: 'infrastructure' },
        { id: 'servers:packages', label: 'Get server packages', category: 'infrastructure' },
        { id: 'servers:sync_accounts', label: 'Sync accounts from server', category: 'infrastructure' },
        { id: 'servers:duplicate', label: 'Duplicate server configuration', category: 'infrastructure' },
    ],
    services: [
        { id: 'services:suspend', label: 'Suspend service', category: 'infrastructure' },
        { id: 'services:unsuspend', label: 'Unsuspend service', category: 'infrastructure' },
        { id: 'services:terminate', label: 'Terminate service', category: 'infrastructure' },
        { id: 'services:cancel_pending', label: 'Cancel pending service before activation', category: 'infrastructure' },
        { id: 'services:delete', label: 'Delete service', category: 'infrastructure', riskLevel: 'high' },
        { id: 'services:change_package', label: 'Change package', category: 'infrastructure' },
        { id: 'services:change_password', label: 'Change hosting password', category: 'infrastructure', riskLevel: 'high' },
        { id: 'services:view_password', label: 'View saved hosting password', category: 'infrastructure', riskLevel: 'high' },
        { id: 'services:retry_provision', label: 'Retry provisioning', category: 'infrastructure' },
        { id: 'services:status_update', label: 'Update service status', category: 'infrastructure' },
        { id: 'services:profile_update', label: 'Update service profile/billing', category: 'infrastructure' },
        { id: 'services:automation_update', label: 'Update automation settings', category: 'infrastructure' },
        { id: 'services:notes_update', label: 'Update admin notes', category: 'infrastructure' },
    ],
    settings: [
        { id: 'settings:read', label: 'View settings', category: 'settings' },
        { id: 'settings:update_billing', label: 'Update billing/reminder settings', category: 'settings' },
    ],
    migration: [
        { id: 'migration:run', label: 'Run WHMCS migration', category: 'settings', riskLevel: 'high' },
    ],
    roles: [
        { id: 'roles:list', label: 'List roles', category: 'settings' },
        { id: 'roles:read', label: 'View role details', category: 'settings' },
        { id: 'roles:create', label: 'Create role', category: 'settings' },
        { id: 'roles:update', label: 'Update role', category: 'settings' },
        { id: 'roles:delete', label: 'Delete role', category: 'settings' },
    ],
    exchange_rate: [
        { id: 'exchange_rate:list', label: 'View exchange rates', category: 'settings' },
        { id: 'exchange_rate:update', label: 'Update exchange rate', category: 'settings' },
    ],
    payment: [
        { id: 'payment:mock_success', label: 'Mock payment success (testing)', category: 'billing', riskLevel: 'high' },
    ],
};

/** Flat list of all permission IDs */
export const ALL_PERMISSION_IDS: string[] = Object.values(PERMISSION_META).flatMap((arr) =>
    arr.map((p) => p.id)
);

/** Resources that support resource:full shorthand */
export const FULL_ACCESS_RESOURCES = Object.keys(PERMISSION_META);

/** Check if a permission is valid */
export function isValidPermission(id: string): boolean {
    return ALL_PERMISSION_IDS.includes(id) || FULL_ACCESS_RESOURCES.some((r) => id === `${r}:full`);
}

/** Get all permissions for a resource (for resource:full expansion) */
export function getPermissionsForResource(resource: string): string[] {
    const meta = PERMISSION_META[resource];
    return meta ? meta.map((p) => p.id) : [];
}

/** Check if user has permission (handles resource:full) */
export function hasPermission(userPermissions: string[], required: string): boolean {
    if (userPermissions.includes(required)) return true;
    const [resource] = required.split(':');
    if (userPermissions.includes(`${resource}:full`)) return true;
    return false;
}

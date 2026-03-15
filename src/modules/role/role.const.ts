/**
 * Role presets for "Create from preset" in the UI.
 * Each preset defines a name and a set of permissions.
 */

export interface RolePreset {
    id: string;
    name: string;
    description: string;
    permissions: string[];
}

export const ROLE_PRESETS: RolePreset[] = [
    {
        id: 'support_agent',
        name: 'Support Agent',
        description: 'Handle tickets and basic client support',
        permissions: [
            'tickets:list',
            'tickets:read',
            'tickets:create',
            'tickets:reply',
            'tickets:update_status',
            'tickets:resolve',
            'clients:list',
            'clients:read',
            'services:suspend',
            'services:unsuspend',
        ],
    },
    {
        id: 'billing_manager',
        name: 'Billing Manager',
        description: 'Manage invoices, transactions, and orders',
        permissions: [
            'invoices:list',
            'invoices:read',
            'invoices:create',
            'invoices:update',
            'invoices:update_status',
            'invoices:send_reminder',
            'invoices:add_payment',
            'invoices:stats',
            'transactions:list',
            'transactions:read',
            'orders:list',
            'orders:read',
            'orders:create',
            'orders:update_status',
        ],
    },
    {
        id: 'server_admin',
        name: 'Server Admin',
        description: 'Manage servers and services',
        permissions: [
            'servers:list',
            'servers:read',
            'servers:create',
            'servers:update',
            'servers:test_connection',
            'servers:packages',
            'servers:sync_accounts',
            'services:suspend',
            'services:unsuspend',
            'services:terminate',
            'services:change_package',
            'services:retry_provision',
            'services:automation_update',
            'services:notes_update',
        ],
    },
    {
        id: 'custom',
        name: 'Custom',
        description: 'Start with no permissions – configure manually',
        permissions: [],
    },
];

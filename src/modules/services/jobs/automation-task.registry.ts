import config from '../../../config';

export type AutomationTaskKey =
    | 'renewals'
    | 'overdue-suspensions'
    | 'invoice-reminders'
    | 'terminations'
    | 'usage-sync'
    | 'action-worker'
    | 'provisioning-worker'
    | 'domain-sync'
    | 'digest-email';

export interface AutomationTaskRegistryItem {
    key: AutomationTaskKey;
    label: string;
    category: 'invoice' | 'service' | 'usage' | 'domain' | 'automation';
    description: string;
    intervalMs: number;
    runOnStart: boolean;
}

export function getAutomationTaskRegistry(): AutomationTaskRegistryItem[] {
    return [
        {
            key: 'renewals',
            label: 'Renewals',
            category: 'invoice',
            description: 'Generate renewal invoices for due recurring services.',
            intervalMs: config.cron.renewalsIntervalMs,
            runOnStart: config.cron.runOnStart,
        },
        {
            key: 'overdue-suspensions',
            label: 'Overdue Suspensions',
            category: 'service',
            description: 'Suspend services linked to overdue unpaid invoices.',
            intervalMs: config.cron.overdueSuspensionsIntervalMs,
            runOnStart: config.cron.runOnStart,
        },
        {
            key: 'invoice-reminders',
            label: 'Invoice Reminders',
            category: 'invoice',
            description: 'Send invoice due and overdue reminder emails.',
            intervalMs: config.cron.invoiceRemindersIntervalMs,
            runOnStart: config.cron.runOnStart,
        },
        {
            key: 'terminations',
            label: 'Terminations',
            category: 'service',
            description: 'Terminate services that passed termination thresholds.',
            intervalMs: config.cron.terminationsIntervalMs,
            runOnStart: config.cron.runOnStart,
        },
        {
            key: 'usage-sync',
            label: 'Usage Sync',
            category: 'usage',
            description: 'Refresh hosting usage snapshots from providers.',
            intervalMs: config.cron.usageSyncIntervalMs,
            runOnStart: false,
        },
        {
            key: 'action-worker',
            label: 'Action Worker',
            category: 'service',
            description: 'Process queued suspend, unsuspend, and terminate actions.',
            intervalMs: config.cron.actionWorkerIntervalMs,
            runOnStart: config.cron.runOnStart,
        },
        {
            key: 'provisioning-worker',
            label: 'Provisioning Worker',
            category: 'service',
            description: 'Process queued provisioning jobs.',
            intervalMs: config.cron.provisioningWorkerIntervalMs,
            runOnStart: config.cron.runOnStart,
        },
        {
            key: 'domain-sync',
            label: 'Domain Sync',
            category: 'domain',
            description: 'Sync transfer and expiry state from registrars.',
            intervalMs: config.cron.domainSyncIntervalMs,
            runOnStart: config.cron.runOnStart,
        },
        {
            key: 'digest-email',
            label: 'Automation Digest Email',
            category: 'automation',
            description: 'Send a periodic summary email with automation and operations totals.',
            intervalMs: config.automationDigest.intervalMs,
            runOnStart: false,
        },
    ];
}

export function getAutomationTaskRegistryItem(
    key: AutomationTaskKey
): AutomationTaskRegistryItem | undefined {
    return getAutomationTaskRegistry().find((task) => task.key === key);
}

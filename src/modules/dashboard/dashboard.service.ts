import Invoice from '../invoice/invoice.model';
import PaymentTransaction from '../transaction/transaction.model';
import { TransactionStatus, TransactionType } from '../transaction/transaction.interface';
import ExchangeRate from '../exchange-rate/exchange-rate.model';
import { Ticket } from '../ticket/ticket.model';
import { automationReportingService } from '../services/core/automation-reporting.service';

function startOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function endOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
}

function resolveDateRange(dateFrom?: string, dateTo?: string): { start: Date; end: Date } {
    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : now;
    const to = dateTo ? new Date(dateTo) : (dateFrom ? new Date(dateFrom) : now);

    const start = startOfUtcDay(from);
    const end = endOfUtcDay(to);

    if (start <= end) return { start, end };

    return {
        start: startOfUtcDay(to),
        end: endOfUtcDay(from),
    };
}

export interface DailyActionsStats {
    invoices: { generated: number };
    lateFees: { added: number; message?: string };
    creditCardCharges: { captured: number; declined: number };
    invoiceReminders: { sent: number };
    currencyExchangeRates: { status: 'completed' | 'pending' | 'not_run'; message?: string };
    cancellationRequests: { processed: number; failed: number; message?: string };
    overdueSuspensions: { suspended: number; failed: number };
    domainTransferSync: { transfersChecked: number };
    domainStatusSync: { domainsSynced: number };
    inactiveTickets: { closed: number };
    databaseBackup: { status: 'completed' | 'disabled' | 'failed'; message?: string };
    serverUsageStats: { status: 'completed' | 'pending' | 'failed'; message?: string };
}

export type DailyActionDetailType = 'invoices' | 'creditCardCharges' | 'inactiveTickets';

export interface DailyActionDetailItem {
    id: string;
    title: string;
    subtitle?: string;
    status?: string;
    amount?: number;
    currency?: string;
    date?: Date | string;
    href?: string;
}

export interface DailyActionDetailsResult {
    type: DailyActionDetailType;
    title: string;
    items: DailyActionDetailItem[];
}

/**
 * Aggregated counts and statuses for a date range (UTC day boundaries).
 * Real data where available; placeholders for features not yet implemented (extensible).
 */
export async function getDailyActionsStats(dateFrom?: string, dateTo?: string): Promise<DailyActionsStats> {
    const { start, end } = resolveDateRange(dateFrom, dateTo);
    return getDailyActionsStatsForRange({ start, end });
}

export async function getDailyActionsStatsForRange(range: { start: Date; end: Date }): Promise<DailyActionsStats> {
    const { start, end } = range;
    const createdRange = { $gte: start, $lte: end };
    const [automationAggregates] = await Promise.all([
        automationReportingService.getTaskAggregates({ start, end }),
    ]);

    const aggregateByKey = new Map(automationAggregates.map((item) => [item.taskKey, item]));
    const reminderAggregate = aggregateByKey.get('invoice-reminders');
    const lateFeesApplied = reminderAggregate?.metrics.lateFeesApplied ?? 0;
    const suspensionAggregate = aggregateByKey.get('overdue-suspensions');
    const domainAggregate = aggregateByKey.get('domain-sync');
    const usageAggregate = aggregateByKey.get('usage-sync');

    const [
        invoicesGenerated,
        creditCardCaptured,
        creditCardDeclined,
        ticketsClosedToday,
        exchangeRateCount,
    ] = await Promise.all([
        Invoice.countDocuments({ createdAt: createdRange }),
        PaymentTransaction.countDocuments({
            createdAt: createdRange,
            type: TransactionType.CHARGE,
            status: TransactionStatus.SUCCESS,
        }),
        PaymentTransaction.countDocuments({
            createdAt: createdRange,
            type: TransactionType.CHARGE,
            status: TransactionStatus.FAILED,
        }),
        Ticket.countDocuments({
            status: { $in: ['closed', 'resolved'] },
            updatedAt: createdRange,
        }),
        ExchangeRate.countDocuments({ createdAt: createdRange }).limit(1),
    ]);

    return {
        invoices: { generated: invoicesGenerated },
        lateFees: {
            added: lateFeesApplied,
            message: lateFeesApplied > 0 ? `${lateFeesApplied} late fee(s) applied` : 'None applied',
        },
        creditCardCharges: { captured: creditCardCaptured, declined: creditCardDeclined },
        invoiceReminders: { sent: reminderAggregate?.metrics.remindersSent ?? 0 },
        currencyExchangeRates: {
            status: exchangeRateCount > 0 ? 'completed' : 'pending',
            message: exchangeRateCount > 0 ? 'Rates available' : 'Task has not completed.',
        },
        cancellationRequests: { processed: 0, failed: 0, message: 'Not instrumented yet' },
        overdueSuspensions: {
            suspended: suspensionAggregate?.metrics.suspendedCount ?? 0,
            failed: suspensionAggregate?.failureRuns ?? 0,
        },
        domainTransferSync: { transfersChecked: domainAggregate?.metrics.transferChecks ?? 0 },
        domainStatusSync: { domainsSynced: domainAggregate?.metrics.domainsSynced ?? 0 },
        inactiveTickets: { closed: ticketsClosedToday },
        databaseBackup: { status: 'disabled', message: 'Disabled' },
        serverUsageStats: {
            status: usageAggregate?.failureRuns
                ? 'failed'
                : usageAggregate?.successRuns
                    ? 'completed'
                    : 'pending',
            message: usageAggregate?.successRuns
                ? `Updated ${usageAggregate.metrics.processed ?? 0} service usage record(s)`
                : usageAggregate?.failureRuns
                    ? `Failed run count: ${usageAggregate.failureRuns}`
                    : 'No usage sync run found in selected range.',
        },
    };
}

export async function getDailyActionDetails(
    type: DailyActionDetailType,
    dateFrom?: string,
    dateTo?: string
): Promise<DailyActionDetailsResult> {
    const { start, end } = resolveDateRange(dateFrom, dateTo);
    const range = { $gte: start, $lte: end };

    if (type === 'invoices') {
        const invoices = await Invoice.find({ createdAt: range })
            .populate('clientId', 'firstName lastName contactEmail')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        return {
            type,
            title: 'Invoices Generated',
            items: invoices.map((invoice: any) => ({
                id: String(invoice._id),
                title: `#${invoice.invoiceNumber}`,
                subtitle: invoice.clientId
                    ? `${[invoice.clientId.firstName, invoice.clientId.lastName].filter(Boolean).join(' ')}${invoice.clientId.contactEmail ? ` • ${invoice.clientId.contactEmail}` : ''}`
                    : undefined,
                status: invoice.status,
                amount: invoice.total,
                currency: invoice.currency,
                date: invoice.createdAt,
                href: `/admin/billing/invoices/${invoice._id}`,
            })),
        };
    }

    if (type === 'creditCardCharges') {
        const transactions = await PaymentTransaction.find({
            createdAt: range,
            type: TransactionType.CHARGE,
            status: { $in: [TransactionStatus.SUCCESS, TransactionStatus.FAILED] },
        })
            .populate('clientId', 'firstName lastName contactEmail')
            .populate('invoiceId', 'invoiceNumber')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        return {
            type,
            title: 'Credit Card Charges',
            items: transactions.map((tx: any) => ({
                id: String(tx._id),
                title: tx.invoiceId?.invoiceNumber
                    ? `Invoice #${tx.invoiceId.invoiceNumber}`
                    : tx.externalTransactionId || `Transaction ${String(tx._id).slice(-6)}`,
                subtitle: tx.clientId
                    ? `${[tx.clientId.firstName, tx.clientId.lastName].filter(Boolean).join(' ')}${tx.clientId.contactEmail ? ` • ${tx.clientId.contactEmail}` : ''}`
                    : tx.gateway,
                status: tx.status,
                amount: tx.amount,
                currency: tx.currency,
                date: tx.paymentDate || tx.createdAt,
                href: tx.invoiceId?._id ? `/admin/billing/invoices/${tx.invoiceId._id}` : '/admin/billing/transactions',
            })),
        };
    }

    const tickets = await Ticket.find({
        status: { $in: ['closed', 'resolved'] },
        updatedAt: range,
    })
        .populate('clientId', 'firstName lastName contactEmail')
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();

    return {
        type,
        title: 'Inactive Tickets',
        items: tickets.map((ticket: any) => ({
            id: String(ticket._id),
            title: `#${ticket.ticketNumber} - ${ticket.subject}`,
            subtitle: ticket.clientId
                ? `${[ticket.clientId.firstName, ticket.clientId.lastName].filter(Boolean).join(' ')}${ticket.clientId.contactEmail ? ` • ${ticket.clientId.contactEmail}` : ''}`
                : undefined,
            status: ticket.status,
            date: ticket.updatedAt,
            href: `/admin/tickets/${ticket._id}`,
        })),
    };
}

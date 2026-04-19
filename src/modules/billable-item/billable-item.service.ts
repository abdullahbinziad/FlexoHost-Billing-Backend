import mongoose from 'mongoose';
import BillableItem from './billable-item.model';
import Client from '../client/client.model';
import Invoice from '../invoice/invoice.model';
import { InvoiceStatus, InvoiceItemType } from '../invoice/invoice.interface';
import { getNextSequence, formatSequenceId } from '../../models/counter.model';
import { getBillingSettings } from '../billing-settings/billing-settings.service';
import { auditLogSafe } from '../activity-log/activity-log.service';
import { InvoiceAction, RecurUnit } from './billable-item.interface';
import { escapeRegex } from '../../utils/escapeRegex';
import { DEFAULT_CURRENCY } from '../../config/currency.config';

export class BillableItemService {
    private addRecurInterval(base: Date, every: number, unit: RecurUnit): Date {
        const next = new Date(base);
        const step = Math.max(1, Number(every || 1));
        if (unit === RecurUnit.DAY) next.setDate(next.getDate() + step);
        else if (unit === RecurUnit.WEEK) next.setDate(next.getDate() + step * 7);
        else if (unit === RecurUnit.MONTH) next.setMonth(next.getMonth() + step);
        else if (unit === RecurUnit.YEAR) next.setFullYear(next.getFullYear() + step);
        return next;
    }

    async create(data: {
        clientId: string;
        productId?: string;
        description: string;
        unitType: 'hours' | 'qty';
        hoursOrQty: number;
        amount: number;
        invoiceAction: string;
        dueDate: Date;
        recurEvery?: number;
        recurUnit?: string;
        recurCount?: number;
        currency: string;
    }) {
        const client = await Client.findById(data.clientId);
        if (!client) throw new Error('Client not found');

        const item = await BillableItem.create({
            clientId: new mongoose.Types.ObjectId(data.clientId),
            productId: data.productId ? new mongoose.Types.ObjectId(data.productId) : undefined,
            description: data.description,
            unitType: data.unitType || 'hours',
            hoursOrQty: data.hoursOrQty ?? 0,
            amount: data.amount ?? 0,
            invoiceAction: data.invoiceAction || InvoiceAction.DONT_INVOICE,
            dueDate: data.dueDate,
            recurEvery: data.recurEvery,
            recurUnit: data.recurUnit,
            recurCount: data.recurCount ?? 0,
            invoiceCount: 0,
            invoiced: false,
            currency: data.currency || 'USD',
        });

        return item;
    }

    async list(params: {
        page?: number;
        limit?: number;
        search?: string;
        clientId?: string;
        invoiced?: boolean;
        invoiceAction?: string;
        recurring?: boolean;
    }) {
        const page = Math.max(1, params.page || 1);
        const limit = Math.min(100, Math.max(1, params.limit || 20));
        const skip = (page - 1) * limit;

        const query: Record<string, unknown> = {};

        if (params.clientId) query.clientId = new mongoose.Types.ObjectId(params.clientId);
        if (params.invoiced !== undefined) query.invoiced = params.invoiced;
        if (params.invoiceAction) query.invoiceAction = params.invoiceAction;
        if (params.recurring) {
            query.invoiceAction = InvoiceAction.RECUR;
        }

        if (params.search?.trim()) {
            const escaped = escapeRegex(params.search.trim());
            query.$or = [
                { description: { $regex: escaped, $options: 'i' } },
            ];
        }

        const [items, total] = await Promise.all([
            BillableItem.find(query)
                .populate('clientId', 'firstName lastName companyName contactEmail')
                .populate('productId', 'name')
                .sort({ dueDate: 1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            BillableItem.countDocuments(query),
        ]);

        return {
            results: items,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
            totalResults: total,
        };
    }

    async getById(id: string) {
        const item = await BillableItem.findById(id)
            .populate('clientId', 'firstName lastName companyName contactEmail')
            .populate('productId', 'name')
            .lean();
        if (!item) throw new Error('Billable item not found');
        return item;
    }

    async update(id: string, data: Partial<{
        description: string;
        unitType: 'hours' | 'qty';
        hoursOrQty: number;
        amount: number;
        invoiceAction: string;
        dueDate: Date;
        recurEvery: number;
        recurUnit: string;
        recurCount: number;
        currency: string;
    }>) {
        const item = await BillableItem.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true }
        )
            .populate('clientId', 'firstName lastName companyName contactEmail')
            .populate('productId', 'name');
        if (!item) throw new Error('Billable item not found');
        return item;
    }

    async delete(id: string) {
        const item = await BillableItem.findByIdAndDelete(id);
        if (!item) throw new Error('Billable item not found');
        return item;
    }

    async bulkUpdateInvoiceAction(ids: string[], action: string) {
        const result = await BillableItem.updateMany(
            { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } },
            { $set: { invoiceAction: action } }
        );
        return result;
    }

    async bulkDelete(ids: string[]) {
        const result = await BillableItem.deleteMany({
            _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
        });
        return result;
    }

    /**
     * Process due billable items that require cron invoicing.
     * Idempotency is enforced by a run key embedded in invoice item meta.
     */
    async processRecurringDueItems(source: 'cron' | 'manual' = 'cron') {
        const now = new Date();
        const settings = await getBillingSettings();
        const invoiceDueDays = settings.invoiceDueDays ?? 7;

        const dueItems = await BillableItem.find({
            dueDate: { $lte: now },
            invoiceAction: { $in: [InvoiceAction.RECUR, InvoiceAction.INVOICE_ON_CRON] },
        }).lean();

        let processed = 0;
        let createdInvoices = 0;
        let skippedExisting = 0;
        let failed = 0;

        for (const item of dueItems) {
            processed += 1;
            try {
                const runSequence = Number(item.invoiceCount || 0) + 1;
                const runKey = `${String(item._id)}:${runSequence}`;
                const existing = await Invoice.findOne({
                    'items.meta.billableItemId': item._id,
                    'items.meta.billableRunKey': runKey,
                })
                    .select('_id')
                    .lean();
                if (existing) {
                    skippedExisting += 1;
                    continue;
                }

                const client = await Client.findById(item.clientId).lean();
                if (!client) {
                    failed += 1;
                    continue;
                }

                const seq = await getNextSequence('invoice');
                const invoiceNumber = formatSequenceId('INV', seq);
                const dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + Math.max(0, invoiceDueDays));

                const amount = Number(item.amount || 0);
                const invoice = await Invoice.create({
                    clientId: item.clientId,
                    invoiceNumber,
                    status: InvoiceStatus.UNPAID,
                    invoiceDate: now,
                    dueDate,
                    billedTo: {
                        companyName: (client as any).companyName || '',
                        customerName: `${(client as any).firstName || ''} ${(client as any).lastName || ''}`.trim() || 'Client',
                        address: (client as any).address?.street || 'N/A',
                        country: (client as any).address?.country || 'N/A',
                    },
                    items: [
                        {
                            type: InvoiceItemType.HOSTING,
                            description: item.description,
                            amount,
                            meta: {
                                billableItemId: item._id,
                                billableRunKey: runKey,
                                source: 'billable_item_recurring',
                            },
                        },
                    ],
                    currency: item.currency || DEFAULT_CURRENCY,
                    subTotal: amount,
                    total: amount,
                    balanceDue: amount,
                    credit: 0,
                });

                const nextInvoiceCount = runSequence;
                const updateData: Record<string, unknown> = {
                    invoiced: true,
                    invoiceId: invoice._id,
                    invoiceCount: nextInvoiceCount,
                };

                if (item.invoiceAction === InvoiceAction.RECUR) {
                    const maxCount = Number(item.recurCount || 0);
                    const reachedLimit = maxCount > 0 && nextInvoiceCount >= maxCount;
                    if (reachedLimit) {
                        updateData.invoiceAction = InvoiceAction.DONT_INVOICE;
                    } else {
                        const recurUnit = (item.recurUnit as RecurUnit) || RecurUnit.MONTH;
                        const recurEvery = Number(item.recurEvery || 1);
                        updateData.dueDate = this.addRecurInterval(new Date(item.dueDate), recurEvery, recurUnit);
                        updateData.invoiced = false;
                        updateData.invoiceId = null;
                    }
                }

                await BillableItem.updateOne({ _id: item._id }, { $set: updateData });
                createdInvoices += 1;

                auditLogSafe({
                    message: `Billable item ${String(item._id)} invoiced as ${invoiceNumber}`,
                    type: 'invoice_auto_generated',
                    category: 'invoice',
                    actorType: 'system',
                    source,
                    clientId: String(item.clientId),
                    invoiceId: String(invoice._id),
                    meta: {
                        billableItemId: String(item._id),
                        runKey,
                    },
                });
            } catch {
                failed += 1;
            }
        }

        return {
            processed,
            createdInvoices,
            skippedExisting,
            failed,
        };
    }
}

export const billableItemService = new BillableItemService();

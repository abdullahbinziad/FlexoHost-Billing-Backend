import mongoose from 'mongoose';
import BillableItem from './billable-item.model';
import Client from '../client/client.model';
import { InvoiceAction } from './billable-item.interface';
import { escapeRegex } from '../../utils/escapeRegex';

export class BillableItemService {
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
}

export const billableItemService = new BillableItemService();

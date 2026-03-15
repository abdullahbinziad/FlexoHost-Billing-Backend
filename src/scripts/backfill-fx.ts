/**
 * Backfill FX snapshots for existing invoices and payment transactions.
 * Run: npm run backfill:fx  (or ts-node src/scripts/backfill-fx.ts)
 * Uses historical rate when available for the date; otherwise fallback rate (fxSnapshotLegacy = true).
 */
import mongoose from 'mongoose';
import config from '../config';
import Invoice from '../modules/invoice/invoice.model';
import PaymentTransaction from '../modules/transaction/transaction.model';
import { buildInvoiceFxSnapshot, buildPaymentFxSnapshot } from '../modules/exchange-rate/fx.service';
import logger from '../utils/logger';

async function connectDB(): Promise<void> {
    await mongoose.connect(config.mongodb.uri);
    logger.info('MongoDB connected');
}

async function backfillInvoices(): Promise<number> {
    const invoices = await Invoice.find({
        $or: [{ fxSnapshot: { $exists: false } }, { fxSnapshot: null }],
    });
    let updated = 0;
    for (const inv of invoices) {
        try {
            const { snapshot, isLegacy } = await buildInvoiceFxSnapshot({
                invoiceDate: inv.invoiceDate,
                currency: inv.currency,
                subTotal: inv.subTotal,
                total: inv.total,
                balanceDue: inv.balanceDue,
            });
            inv.fxSnapshot = snapshot;
            inv.fxSnapshotLegacy = isLegacy;
            inv.baseCurrency = snapshot.baseCurrency;
            inv.totalInBase = snapshot.totalInBase;
            inv.balanceDueInBase = snapshot.balanceDueInBase;
            await inv.save();
            updated++;
        } catch (e: any) {
            logger.warn(`Invoice ${inv._id} backfill failed: ${e?.message}`);
        }
    }
    return updated;
}

async function backfillTransactions(): Promise<number> {
    const txs = await PaymentTransaction.find({
        $or: [{ fxSnapshot: { $exists: false } }, { fxSnapshot: null }],
    });
    let updated = 0;
    for (const tx of txs) {
        try {
            const paymentDate = tx.paymentDate ?? (tx as any).createdAt ?? new Date();
            const { snapshot, isLegacy } = await buildPaymentFxSnapshot(
                tx.amount,
                tx.currency,
                paymentDate
            );
            tx.fxSnapshot = snapshot;
            tx.fxSnapshotLegacy = isLegacy;
            tx.paymentDate = paymentDate;
            await tx.save();
            updated++;
        } catch (e: any) {
            logger.warn(`Transaction ${tx._id} backfill failed: ${e?.message}`);
        }
    }
    return updated;
}

async function main(): Promise<void> {
    await connectDB();
    logger.info('Starting FX backfill (invoices then transactions)...');
    const invCount = await backfillInvoices();
    logger.info(`Invoices updated: ${invCount}`);
    const txCount = await backfillTransactions();
    logger.info(`Transactions updated: ${txCount}`);
    logger.info('FX backfill done.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    logger.error('Backfill failed:', err);
    process.exit(1);
});

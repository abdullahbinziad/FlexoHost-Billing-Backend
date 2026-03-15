/**
 * Migrate WHMCS tblaccounts (transactions) → FlexoHost PaymentTransaction
 */
import mysql from 'mysql2/promise';
import PaymentTransaction from '../../modules/transaction/transaction.model';
import { getFlexohostId } from './id-mapping.model';
import { TransactionType, TransactionStatus } from '../../modules/transaction/transaction.interface';

export async function migrateTransactions(conn: mysql.Connection, dryRun: boolean): Promise<number> {
    let count = 0;
    try {
        const [rows] = await conn.query<any[]>(
            'SELECT * FROM tblaccounts ORDER BY id ASC'
        );

        for (const r of rows || []) {
            const clientId = await getFlexohostId('client', r.userid);
            const invoiceId = r.invoiceid ? await getFlexohostId('invoice', r.invoiceid) : undefined;
            if (!clientId) continue;

            if (dryRun) {
                count++;
                continue;
            }

            const amountIn = parseFloat(r.amountin || r.amount || 0) || 0;
            const amountOut = parseFloat(r.amountout || 0) || 0;
            const amount = amountIn > 0 ? amountIn : amountOut;
            if (amount <= 0) continue;

            await PaymentTransaction.create({
                clientId,
                invoiceId,
                gateway: (r.gateway || 'migrated').trim().slice(0, 50),
                type: amountIn > 0 ? TransactionType.CHARGE : TransactionType.REFUND,
                status: TransactionStatus.SUCCESS,
                amount: Math.abs(amount),
                currency: (r.currency || 'USD').toString().slice(0, 3),
                paymentDate: r.date ? new Date(r.date) : new Date(),
                externalTransactionId: (r.transid || r.id?.toString() || '').trim() || undefined,
                gatewayPayload: { whmcsId: r.id },
            });
            count++;
        }
    } catch (err) {
        console.warn('tblaccounts not found or error:', (err as Error).message);
    }
    return count;
}

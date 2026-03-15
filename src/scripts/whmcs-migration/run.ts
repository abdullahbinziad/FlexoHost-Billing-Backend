#!/usr/bin/env ts-node
/**
 * WHMCS → FlexoHost Migration Runner
 *
 * Prerequisites:
 * 1. Import WHMCS SQL dump into MySQL
 * 2. Set WHMCS_MYSQL_* and MONGODB_URI in .env
 *
 * Usage:
 *   ts-node src/scripts/whmcs-migration/run.ts
 *   ts-node src/scripts/whmcs-migration/run.ts --dry-run
 */
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import { whmcsConfig, mongoUri } from './config';
import { migrateClients } from './migrate-clients';
import { migrateProducts } from './migrate-products';
import { migrateServers } from './migrate-servers';
import { migrateOrders } from './migrate-orders';
import { migrateInvoices } from './migrate-invoices';
import { migrateServices } from './migrate-services';
import { migrateTransactions } from './migrate-transactions';

const dryRun = process.argv.includes('--dry-run');

async function main() {
    console.log('WHMCS → FlexoHost Migration');
    console.log(dryRun ? '(DRY RUN - no writes)' : '');
    console.log('');

    let mysqlConn: mysql.Connection | null = null;

    try {
        console.log('Connecting to WHMCS MySQL...');
        mysqlConn = await mysql.createConnection({
            host: whmcsConfig.host,
            port: whmcsConfig.port,
            user: whmcsConfig.user,
            password: whmcsConfig.password,
            database: whmcsConfig.database,
        });
        console.log('MySQL connected.');

        console.log('Connecting to FlexoHost MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('MongoDB connected.');
        console.log('');

        const results: Record<string, number | object> = {};

        console.log('1. Migrating clients...');
        const clientsResult = await migrateClients(mysqlConn, dryRun);
        results.clients = clientsResult;
        console.log(`   → Clients: ${clientsResult.clients}, Users: ${clientsResult.users}`);

        console.log('2. Migrating products...');
        results.products = await migrateProducts(mysqlConn, dryRun);
        console.log(`   → Products: ${results.products}`);

        console.log('3. Migrating servers...');
        results.servers = await migrateServers(mysqlConn, dryRun);
        console.log(`   → Servers: ${results.servers}`);

        console.log('4. Migrating orders...');
        results.orders = await migrateOrders(mysqlConn, dryRun);
        console.log(`   → Orders: ${results.orders}`);

        console.log('5. Migrating invoices...');
        results.invoices = await migrateInvoices(mysqlConn, dryRun);
        console.log(`   → Invoices: ${results.invoices}`);

        console.log('6. Migrating services (hosting + domains)...');
        results.services = await migrateServices(mysqlConn, dryRun);
        console.log(`   → Services: ${results.services}`);

        console.log('7. Migrating transactions...');
        results.transactions = await migrateTransactions(mysqlConn, dryRun);
        console.log(`   → Transactions: ${results.transactions}`);

        console.log('');
        console.log('Migration complete.');
        console.log('Summary:', JSON.stringify(results, null, 2));
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        if (mysqlConn) await mysqlConn.end();
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

main();

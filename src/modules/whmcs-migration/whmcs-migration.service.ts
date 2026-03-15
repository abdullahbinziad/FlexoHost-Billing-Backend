/**
 * WHMCS Migration Service - Import SQL and run migration
 */
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip') as any;
import { whmcsConfig, mongoUri } from '../../scripts/whmcs-migration/config';
import { migrateClients } from '../../scripts/whmcs-migration/migrate-clients';
import { migrateProducts } from '../../scripts/whmcs-migration/migrate-products';
import { migrateServers } from '../../scripts/whmcs-migration/migrate-servers';
import { migrateOrders } from '../../scripts/whmcs-migration/migrate-orders';
import { migrateInvoices } from '../../scripts/whmcs-migration/migrate-invoices';
import { migrateServices } from '../../scripts/whmcs-migration/migrate-services';
import { migrateTransactions } from '../../scripts/whmcs-migration/migrate-transactions';

const MAX_SQL_SIZE = 200 * 1024 * 1024; // 200MB

export interface MigrationResult {
    success: boolean;
    import?: { success: boolean; message?: string };
    migration?: Record<string, number | object>;
    error?: string;
}

export async function runWhmcsMigration(filePath: string): Promise<MigrationResult> {
    let sqlPath = filePath;
    let tempDir: string | null = null;

    try {
        if (filePath.toLowerCase().endsWith('.zip')) {
            tempDir = path.join(path.dirname(filePath), 'whmcs-extract-' + Date.now());
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();
            const sqlEntry = entries.find((e: { isDirectory: boolean; entryName: string }) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.sql'));
            if (!sqlEntry) {
                return { success: false, error: 'No .sql file found in archive' };
            }
            fs.mkdirSync(tempDir, { recursive: true });
            zip.extractEntryTo(sqlEntry, tempDir, false, true);
            sqlPath = path.join(tempDir, path.basename(sqlEntry.entryName));
        }

        const stat = fs.statSync(sqlPath);
        if (stat.size > MAX_SQL_SIZE) {
            return { success: false, error: `SQL file too large (max ${MAX_SQL_SIZE / 1024 / 1024}MB)` };
        }

        let sqlContent = fs.readFileSync(sqlPath, 'utf8');
        const dbName = whmcsConfig.database;
        sqlContent = sqlContent
            .replace(/CREATE DATABASE\s+IF NOT EXISTS\s+`?(\w+)`?/gi, `CREATE DATABASE IF NOT EXISTS \`${dbName}\``)
            .replace(/CREATE DATABASE\s+`?(\w+)`?/gi, `CREATE DATABASE IF NOT EXISTS \`${dbName}\``)
            .replace(/USE\s+`?(\w+)`?/gi, `USE \`${dbName}\``);

        let mysqlConn: mysql.Connection | null = null;

        if (!whmcsConfig.password && whmcsConfig.user === 'root') {
            return {
                success: false,
                error: 'WHMCS_MYSQL_PASSWORD is empty. Set it in .env and restart the backend. Example: WHMCS_MYSQL_PASSWORD="YourPassword"',
            };
        }

        try {
            mysqlConn = await mysql.createConnection({
                host: whmcsConfig.host,
                port: whmcsConfig.port,
                user: whmcsConfig.user,
                password: whmcsConfig.password,
                multipleStatements: true,
            });

            await mysqlConn.query(`DROP DATABASE IF EXISTS \`${whmcsConfig.database}\``);
            await mysqlConn.query(`CREATE DATABASE \`${whmcsConfig.database}\``);
            await mysqlConn.query(`USE \`${whmcsConfig.database}\``);

            // Increase max_allowed_packet for large SQL dumps; requires reconnect to take effect
            await mysqlConn.query(`SET GLOBAL max_allowed_packet = 1073741824`).catch(() => {});
            await mysqlConn.end();
            mysqlConn = await mysql.createConnection({
                host: whmcsConfig.host,
                port: whmcsConfig.port,
                user: whmcsConfig.user,
                password: whmcsConfig.password,
                database: whmcsConfig.database,
                multipleStatements: true,
            });

            try {
                await mysqlConn.query(sqlContent);
            } catch (err: any) {
                if (err.code === 'ER_PARSE_ERROR' || err.message?.includes('syntax')) {
                    const statements = splitSqlStatements(sqlContent);
                    for (let i = 0; i < statements.length; i++) {
                        const stmt = statements[i].trim();
                        if (!stmt || stmt.startsWith('--')) continue;
                        try {
                            await mysqlConn!.query(stmt);
                        } catch (e: any) {
                            if (e.code !== 'ER_DB_CREATE_EXISTS' && e.code !== 'ER_TABLE_EXISTS_ERROR') {
                                console.warn(`SQL stmt ${i + 1}:`, e.message);
                            }
                        }
                    }
                } else {
                    throw err;
                }
            }

            await mysqlConn.end();
            mysqlConn = null;
        } catch (importErr: any) {
            if (mysqlConn) await mysqlConn.end().catch(() => {});
            return {
                success: false,
                import: { success: false, message: importErr?.message || 'MySQL import failed' },
                error: importErr?.message,
            };
        }

        await mongoose.connect(mongoUri);
        mysqlConn = await mysql.createConnection({
            host: whmcsConfig.host,
            port: whmcsConfig.port,
            user: whmcsConfig.user,
            password: whmcsConfig.password,
            database: whmcsConfig.database,
        });

        const results: Record<string, number | object> = {};
        results.clients = await migrateClients(mysqlConn, false);
        results.products = await migrateProducts(mysqlConn, false);
        results.servers = await migrateServers(mysqlConn, false);
        results.orders = await migrateOrders(mysqlConn, false);
        results.invoices = await migrateInvoices(mysqlConn, false);
        results.services = await migrateServices(mysqlConn, false);
        results.transactions = await migrateTransactions(mysqlConn, false);

        await mysqlConn.end();
        await mongoose.disconnect();

        return {
            success: true,
            import: { success: true },
            migration: results,
        };
    } catch (err: any) {
        return {
            success: false,
            error: err?.message || 'Migration failed',
        };
    } finally {
        if (tempDir && fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {
                // ignore cleanup errors
            }
        }
    }
}

function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let i = 0;

    while (i < sql.length) {
        const c = sql[i];
        const next = sql[i + 1];

        if (!inString) {
            if ((c === "'" || c === '"' || c === '`') && (i === 0 || sql[i - 1] !== '\\')) {
                inString = true;
                stringChar = c;
                current += c;
                i++;
                continue;
            }
            if (c === ';' && (next === '\n' || next === '\r' || next === ' ' || next === undefined)) {
                statements.push(current.trim());
                current = '';
                i++;
                if (next === '\r') i++;
                if (next === '\n') i++;
                continue;
            }
        } else {
            if (c === '\\' && next === stringChar) {
                current += c + next;
                i += 2;
                continue;
            }
            if (c === stringChar) {
                inString = false;
            }
        }
        current += c;
        i++;
    }
    if (current.trim()) statements.push(current.trim());
    return statements;
}

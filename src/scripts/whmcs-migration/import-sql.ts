#!/usr/bin/env ts-node
/**
 * Import WHMCS SQL dump into MySQL before running migration.
 *
 * Usage:
 *   ts-node src/scripts/whmcs-migration/import-sql.ts /path/to/whmcs.sql
 *   ts-node src/scripts/whmcs-migration/import-sql.ts /path/to/whmcs.sql.zip
 *
 * Or set WHMCS_SQL_PATH in .env
 *
 * Requires: mysql client in PATH (for mysql command) and unzip (for .zip files)
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { whmcsConfig } from './config';

function main() {
    const sqlPath = process.env.WHMCS_SQL_PATH || process.argv[2];
    if (!sqlPath) {
        console.error('Usage: ts-node import-sql.ts <path-to-whmcs.sql|whmcs.sql.zip>');
        console.error('Or set WHMCS_SQL_PATH in .env');
        process.exit(1);
    }

    const resolved = path.resolve(process.cwd(), sqlPath);
    if (!fs.existsSync(resolved)) {
        console.error('File not found:', resolved);
        process.exit(1);
    }

    let sqlFile = resolved;
    if (resolved.endsWith('.zip')) {
        console.log('Extracting .zip...');
        const dir = path.dirname(resolved);
        execSync(`unzip -o "${resolved}" -d "${dir}"`, { stdio: 'inherit' });
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
        if (files.length === 0) {
            console.error('No .sql file found in archive');
            process.exit(1);
        }
        sqlFile = path.join(dir, files[0]);
        console.log('Using:', sqlFile);
    }

    const { host, port, user, password, database } = whmcsConfig;
    const env = { ...process.env };
    if (password) env.MYSQL_PWD = password;
    const mysqlCmd = `mysql -h ${host} -P ${port} -u ${user}`;

    console.log('Creating database if not exists...');
    execSync(`${mysqlCmd} -e "CREATE DATABASE IF NOT EXISTS \`${database}\`;"`, { stdio: 'inherit', env });

    console.log('Importing SQL...');
    execSync(`${mysqlCmd} ${database} < "${sqlFile}"`, { stdio: 'inherit', env });

    console.log('Import complete. Run: npm run migrate:whmcs');
}

main();

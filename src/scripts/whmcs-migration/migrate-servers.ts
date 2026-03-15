/**
 * Migrate WHMCS tblservers → FlexoHost Server
 */
import mysql from 'mysql2/promise';
import Server from '../../modules/server/server.model';
import { setMapping, getFlexohostId } from './id-mapping.model';

export async function migrateServers(conn: mysql.Connection, dryRun: boolean): Promise<number> {
    let count = 0;
    try {
        const [rows] = await conn.query<any[]>('SELECT * FROM tblservers ORDER BY id ASC');

        for (const r of rows || []) {
            const whmcsId = r.id;
            const existing = await getFlexohostId('server', whmcsId);
            if (existing) continue;

            if (dryRun) {
                console.log(`[DRY-RUN] Would migrate server ${whmcsId}: ${r.name}`);
                count++;
                continue;
            }

            const server = await Server.create({
                name: (r.name || `Server ${whmcsId}`).trim(),
                hostname: (r.hostname || r.ipaddress || `server${whmcsId}`).trim(),
                ipAddress: (r.ipaddress || '').trim() || undefined,
                monthlyCost: parseFloat(r.monthlycost || 0) || 0,
                maxAccounts: parseInt(r.maxaccounts || 200, 10) || 200,
                isEnabled: (r.disabled || 0) == 0,
                location: 'USA',
                groups: ['Web Hosting'],
                nameservers: {
                    ns1: (r.nameserver1 || 'ns1.example.com').trim(),
                    ns2: (r.nameserver2 || 'ns2.example.com').trim(),
                },
                module: {
                    type: (r.type || 'cpanel').toLowerCase().includes('directadmin') ? 'directadmin' : 'cpanel',
                    username: (r.username || 'root').trim(),
                    password: (r.password || '').trim(),
                    isSecure: true,
                    port: parseInt(r.port || 2087, 10) || 2087,
                },
            });

            await setMapping('server', whmcsId, server._id);
            count++;
        }
    } catch (err) {
        console.warn('tblservers not found or error:', (err as Error).message);
    }
    return count;
}

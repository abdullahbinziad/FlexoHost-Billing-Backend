/**
 * Migrate WHMCS tblproducts + tblproductgroups → FlexoHost Product
 */
import mysql from 'mysql2/promise';
import Product from '../../modules/product/product.model';
import { setMapping, getFlexohostId } from './id-mapping.model';

const WHMCS_TYPE_MAP: Record<string, string> = {
    hosting: 'hosting',
    server: 'vps',
    domain: 'domain',
    domainregister: 'domain',
    domaintransfer: 'domain',
    ssl: 'ssl',
    other: 'hosting',
};

export async function migrateProducts(conn: mysql.Connection, dryRun: boolean): Promise<number> {
    const [groups] = await conn.query<any[]>('SELECT * FROM tblproductgroups ORDER BY id');
    const groupNames: Record<number, string> = {};
    for (const g of groups || []) {
        groupNames[g.id] = (g.name || 'General').trim();
    }

    const [rows] = await conn.query<any[]>('SELECT * FROM tblproducts ORDER BY id ASC');
    let count = 0;

    for (const r of rows || []) {
        const whmcsId = r.id;
        const existing = await getFlexohostId('product', whmcsId);
        if (existing) continue;

        const type = WHMCS_TYPE_MAP[(r.type || 'other').toLowerCase()] || 'hosting';
        const group = groupNames[r.gid] || 'General';

        if (dryRun) {
            console.log(`[DRY-RUN] Would migrate product ${whmcsId}: ${r.name} (${type})`);
            count++;
            continue;
        }

        const pricing: any[] = [];
        const currency = (r.currency || 'USD').toString().toUpperCase().slice(0, 3);
        const monthly = parseFloat(r.monthly || 0) || 0;
        const quarterly = parseFloat(r.quarterly || 0) || monthly * 3;
        const semiAnnually = parseFloat(r.semiannually || 0) || monthly * 6;
        const annually = parseFloat(r.annually || 0) || monthly * 12;
        const biennially = parseFloat(r.biennially || 0) || annually * 2;
        const triennially = parseFloat(r.triennially || 0) || annually * 3;
        const setup = parseFloat(r.setupfee || 0) || 0;

        const payType = (r.paytype || 'recurring').toLowerCase();
        const paymentType = payType === 'free' ? 'free' : payType === 'onetime' ? 'one-time' : 'recurring';

        if (paymentType !== 'free') {
            const p = {
                currency,
                monthly: { price: monthly, setupFee: setup, renewPrice: monthly, enable: monthly > 0 },
                quarterly: { price: quarterly, setupFee: setup, renewPrice: quarterly, enable: quarterly > 0 },
                semiAnnually: { price: semiAnnually, setupFee: setup, renewPrice: semiAnnually, enable: semiAnnually > 0 },
                annually: { price: annually, setupFee: setup, renewPrice: annually, enable: annually > 0 },
                biennially: { price: biennially, setupFee: setup, renewPrice: biennially, enable: biennially > 0 },
                triennially: { price: triennially, setupFee: setup, renewPrice: triennially, enable: triennially > 0 },
            };
            const anyEnabled = [monthly, quarterly, semiAnnually, annually, biennially, triennially].some((x) => x > 0);
            if (!anyEnabled) p.monthly.enable = true;
            pricing.push(p);
        }

        try {
            const product = await Product.create({
                name: (r.name || `Product ${whmcsId}`).trim().slice(0, 100),
                type,
                group,
                description: (r.description || '').trim().slice(0, 500) || undefined,
                paymentType,
                pricing: pricing.length ? pricing : undefined,
                isHidden: (r.hidden || 0) == 1,
            });
            await setMapping('product', whmcsId, product._id);
            count++;
        } catch (err) {
            console.error(`Failed to migrate product ${whmcsId}:`, err);
        }
    }

    return count;
}

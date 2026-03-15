/**
 * Migrate WHMCS tblclients → FlexoHost Client + User
 */
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../../modules/user/user.model';
import Client from '../../modules/client/client.model';
import { setMapping, getFlexohostId } from './id-mapping.model';

const BCRYPT_ROUNDS = 10;

export async function migrateClients(conn: mysql.Connection, dryRun: boolean): Promise<{ clients: number; users: number }> {
    const [rows] = await conn.query<any[]>('SELECT * FROM tblclients ORDER BY id ASC');
    let clientsCreated = 0;
    let usersCreated = 0;

    for (const r of rows || []) {
        const whmcsId = r.id;
        const email = (r.email || '').trim().toLowerCase();
        if (!email) continue;

        const existing = await getFlexohostId('client', whmcsId);
        if (existing) continue;

        if (dryRun) {
            console.log(`[DRY-RUN] Would migrate client ${whmcsId}: ${r.firstname} ${r.lastname} <${email}>`);
            clientsCreated++;
            usersCreated++;
            continue;
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            let userId: mongoose.Types.ObjectId;
            const found = await User.findOne({ email }).session(session).select('_id');
            if (found) {
                userId = found._id;
            } else {
                const passwordHash = r.password
                    ? await bcrypt.hash(String(r.password).slice(0, 72), BCRYPT_ROUNDS)
                    : await bcrypt.hash('ChangeMe123!', BCRYPT_ROUNDS);

                const user = await User.create([{
                    email,
                    password: passwordHash,
                    role: 'client',
                    provider: 'local',
                    providerId: `whmcs_${whmcsId}`,
                    active: (r.status || 'Active') === 'Active',
                    verified: true,
                }], { session });
                userId = user[0]._id;
            }

            const client = await Client.create([{
                user: userId,
                firstName: (r.firstname || 'Client').trim().slice(0, 50),
                lastName: (r.lastname || String(whmcsId)).trim().slice(0, 50),
                companyName: (r.companyname || '').trim().slice(0, 100) || undefined,
                contactEmail: email,
                phoneNumber: (r.phonenumber || '').trim() || undefined,
                address: {
                    street: (r.address1 || '').trim(),
                    city: (r.city || '').trim(),
                    state: (r.state || '').trim(),
                    postCode: (r.postcode || '').trim(),
                    country: (r.country || '').trim(),
                },
                accountCreditBalance: parseFloat(r.credit || 0) || 0,
                accountCreditCurrency: (() => {
                    const c = String(r.currency || 'USD').toUpperCase().trim();
                    return /^[A-Z]{3}$/.test(c) ? c : 'USD';
                })(),
            }], { session });
            const clientId = client[0]._id;

            await setMapping('client', whmcsId, clientId);
            await setMapping('user_client', whmcsId, userId);

            await session.commitTransaction();
            clientsCreated++;
            if (!found) usersCreated++;
        } catch (err) {
            await session.abortTransaction();
            console.error(`Failed to migrate client ${whmcsId}:`, err);
        } finally {
            session.endSession();
        }
    }

    return { clients: clientsCreated, users: usersCreated };
}

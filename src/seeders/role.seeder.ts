import mongoose from 'mongoose';
import config from '../config';
import Role from '../modules/role/role.model';
import User from '../modules/user/user.model';
import { defaultRoles } from './data/roles.seed';
import logger from '../utils/logger';
import { USER_ROLES } from '../modules/user/user.const';
import { ALL_PERMISSION_IDS } from '../modules/role/permission.const';

const connectDB = async (): Promise<void> => {
    try {
        await mongoose.connect(config.mongodb.uri);
        logger.info('✅ MongoDB Connected for Role Seeding');
    } catch (error) {
        logger.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

export const seedRoles = async (): Promise<void> => {
    try {
        logger.info('🌱 Starting Role Seeding...');

        for (const r of defaultRoles) {
            const existing = await Role.findOne({ slug: r.slug, archived: { $ne: true } });
            if (!existing) {
                await Role.create(r);
                logger.info(`   ✅ Created role: ${r.name} (${r.slug})`);
            } else {
                logger.info(`   ⏭️  Role already exists: ${r.name}`);
                // Ensure super_admin always has all route permissions when seeding
                if (r.slug === 'super_admin') {
                    existing.permissions = [...ALL_PERMISSION_IDS];
                    await existing.save();
                    logger.info(`   ✅ Synced Super Admin role with all ${ALL_PERMISSION_IDS.length} permissions`);
                }
            }
        }

        logger.info('✅ Role seeding complete');
    } catch (error: any) {
        logger.error('❌ Error seeding roles:', error.message);
        throw error;
    }
};

export const migrateUsersToRoles = async (): Promise<void> => {
    try {
        logger.info('🌱 Migrating users to roles...');

        const superAdminRole = await Role.findOne({ slug: 'super_admin', archived: { $ne: true } });
        const adminRole = await Role.findOne({ slug: 'admin', archived: { $ne: true } });
        const staffRole = await Role.findOne({ slug: 'staff', archived: { $ne: true } });

        if (!superAdminRole || !adminRole || !staffRole) {
            logger.warn('⚠️  Roles not found. Run role seeder first.');
            return;
        }

        const noRoleId = { $or: [{ roleId: null }, { roleId: { $exists: false } }] };
        const superadminUsers = await User.find({ role: USER_ROLES.SUPERADMIN, ...noRoleId });
        const adminUsers = await User.find({ role: USER_ROLES.ADMIN, ...noRoleId });
        const staffUsers = await User.find({ role: USER_ROLES.STAFF, ...noRoleId });

        let updated = 0;
        for (const u of superadminUsers) {
            await User.findByIdAndUpdate(u._id, { roleId: superAdminRole._id });
            updated++;
        }
        for (const u of adminUsers) {
            await User.findByIdAndUpdate(u._id, { roleId: adminRole._id });
            updated++;
        }
        for (const u of staffUsers) {
            await User.findByIdAndUpdate(u._id, { roleId: staffRole._id });
            updated++;
        }

        logger.info(`✅ Migrated ${updated} users to roles`);
    } catch (error: any) {
        logger.error('❌ Error migrating users:', error.message);
        throw error;
    }
};

const runSeeder = async (): Promise<void> => {
    try {
        await connectDB();
        await seedRoles();
        await migrateUsersToRoles();
        await mongoose.connection.close();
        logger.info('🔌 Database connection closed');
        process.exit(0);
    } catch (error: any) {
        logger.error('❌ Seeding failed:', error.message);
        await mongoose.connection.close();
        process.exit(1);
    }
};

if (require.main === module) {
    runSeeder();
}

export default runSeeder;

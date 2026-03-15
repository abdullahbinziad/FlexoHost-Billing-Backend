import mongoose from 'mongoose';
import config from '../config';
import User from '../modules/user/user.model';
import Client from '../modules/client/client.model';
import { defaultUsers } from './data/users.seed';
import logger from '../utils/logger';

/**
 * Connect to MongoDB
 */
const connectDB = async (): Promise<void> => {
    try {
        await mongoose.connect(config.mongodb.uri);
        logger.info('✅ MongoDB Connected for Seeding');
    } catch (error) {
        logger.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

/**
 * Seed Users
 */
export const seedUsers = async (): Promise<void> => {
    try {
        logger.info('🌱 Starting User Seeding...');

        // Check if users already exist
        const existingUsersCount = await User.countDocuments();

        if (existingUsersCount > 0) {
            logger.warn(
                `⚠️  Database already contains ${existingUsersCount} user(s). Skipping seeding.`
            );
            logger.info('💡 Use --force flag to clear existing data and reseed.');
            return;
        }

        // Create users
        const createdUsers = [];

        for (const defaultUser of defaultUsers) {
            const [user] = await User.create([{
                email: defaultUser.email,
                password: defaultUser.password,
                role: defaultUser.role,
                verified: defaultUser.verified,
                active: defaultUser.active,
                provider: 'local',
                providerId: `local_${defaultUser.email}`,
            }]);

            await Client.create({
                user: user._id,
                firstName: defaultUser.firstName,
                lastName: defaultUser.lastName,
                contactEmail: defaultUser.email,
                phoneNumber: defaultUser.phone || undefined,
                address: defaultUser.address || undefined,
            });

            createdUsers.push(user);
        }

        logger.info(`✅ Successfully seeded ${createdUsers.length} users and clients:`);
        for (let i = 0; i < createdUsers.length; i++) {
            logger.info(`   - ${defaultUsers[i].firstName} ${defaultUsers[i].lastName} (${createdUsers[i].email}) - Role: ${createdUsers[i].role}`);
        }
    } catch (error: any) {
        logger.error('❌ Error seeding users:', error?.message ?? error);
        throw error;
    }
};

/**
 * Clear all users from database
 */
export const clearUsers = async (): Promise<void> => {
    try {
        logger.info('🗑️  Clearing existing users and clients...');
        const userResult = await User.deleteMany({});
        const clientResult = await Client.deleteMany({});
        logger.info(`✅ Deleted ${userResult.deletedCount} user(s) and ${clientResult.deletedCount} client(s)`);
    } catch (error: any) {
        logger.error('❌ Error clearing users:', error.message);
        throw error;
    }
};

/**
 * Main seeder function
 */
const runSeeder = async (): Promise<void> => {
    try {
        await connectDB();

        const args = process.argv.slice(2);
        const forceFlag = args.includes('--force') || args.includes('-f');
        const clearFlag = args.includes('--clear') || args.includes('-c');

        if (clearFlag) {
            await clearUsers();
            logger.info('✅ Database cleared successfully');
        } else if (forceFlag) {
            await clearUsers();
            await seedUsers();
            logger.info('✅ Database seeded successfully (forced)');
        } else {
            await seedUsers();
            logger.info('✅ Database seeded successfully');
        }

        await mongoose.connection.close();
        logger.info('🔌 Database connection closed');
        process.exit(0);
    } catch (error: any) {
        logger.error('❌ Seeding failed:', error.message);
        await mongoose.connection.close();
        process.exit(1);
    }
};

// Run seeder if this file is executed directly
if (require.main === module) {
    runSeeder();
}

export default runSeeder;

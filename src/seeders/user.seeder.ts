import mongoose from 'mongoose';
import config from '../config';
import User from '../modules/user/user.model';
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

        // Create users (using create() to trigger pre-save middleware for password hashing)
        const createdUsers = await User.create(defaultUsers);

        logger.info(`✅ Successfully seeded ${createdUsers.length} users:`);
        createdUsers.forEach((user) => {
            logger.info(`   - ${user.name} (${user.email}) - Role: ${user.role}`);
        });
    } catch (error: any) {
        logger.error('❌ Error seeding users:', error.message);
        throw error;
    }
};

/**
 * Clear all users from database
 */
export const clearUsers = async (): Promise<void> => {
    try {
        logger.info('🗑️  Clearing existing users...');
        const result = await User.deleteMany({});
        logger.info(`✅ Deleted ${result.deletedCount} user(s)`);
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

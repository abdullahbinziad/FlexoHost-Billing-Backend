import mongoose from 'mongoose';
import config from '../config';
import { seedUsers, clearUsers } from './user.seeder';
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
 * Seed all data
 */
const seedAll = async (force: boolean = false): Promise<void> => {
    try {
        logger.info('🌱 Starting Database Seeding...');
        logger.info('='.repeat(50));

        if (force) {
            logger.info('🗑️  Force flag detected - Clearing all data...');
            await clearUsers();
            // Add more clear functions here as you add more seeders
            logger.info('✅ All data cleared');
            logger.info('='.repeat(50));
        }

        // Seed users
        await seedUsers();

        // Add more seed functions here as you create more seeders
        // Example:
        // await seedProducts();
        // await seedOrders();

        logger.info('='.repeat(50));
        logger.info('✅ All seeding completed successfully!');
    } catch (error: any) {
        logger.error('❌ Seeding failed:', error.message);
        throw error;
    }
};

/**
 * Clear all data
 */
const clearAll = async (): Promise<void> => {
    try {
        logger.info('🗑️  Clearing all data from database...');
        logger.info('='.repeat(50));

        await clearUsers();
        // Add more clear functions here as you add more seeders

        logger.info('='.repeat(50));
        logger.info('✅ All data cleared successfully!');
    } catch (error: any) {
        logger.error('❌ Clearing failed:', error.message);
        throw error;
    }
};

/**
 * Main function
 */
const main = async (): Promise<void> => {
    try {
        await connectDB();

        const args = process.argv.slice(2);
        const forceFlag = args.includes('--force') || args.includes('-f');
        const clearFlag = args.includes('--clear') || args.includes('-c');

        if (clearFlag) {
            await clearAll();
        } else {
            await seedAll(forceFlag);
        }

        await mongoose.connection.close();
        logger.info('🔌 Database connection closed');
        logger.info('👋 Goodbye!');
        process.exit(0);
    } catch (error: any) {
        logger.error('❌ Process failed:', error.message);
        await mongoose.connection.close();
        process.exit(1);
    }
};

// Run if this file is executed directly
if (require.main === module) {
    main();
}

export default main;

import mongoose from 'mongoose';
import config from './index';
import logger from '../utils/logger';

const connectDB = async (): Promise<void> => {
    try {
        const mongoURI = config.env === 'test' ? config.mongodb.testUri : config.mongodb.uri;

        await mongoose.connect(mongoURI, {
            // Modern MongoDB connection options
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        logger.info(`MongoDB Connected: ${mongoose.connection.host}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed due to app termination');
            process.exit(0);
        });

    } catch (error) {
        logger.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
};

export default connectDB;

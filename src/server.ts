import app from './app';
import config from './config';
import connectDB from './config/database';
import { automationScheduler } from './modules/services/jobs/automation.scheduler';
import logger from './utils/logger';

const UNSAFE_SECRETS = ['your-super-secret', 'change-this-in-production', 'change-in-production', 'dev-secret', 'secret'];

function validateSecrets(): void {
    if (config.env !== 'production') return;
    const jwtSecret = process.env.JWT_SECRET || '';
    const refreshSecret = process.env.JWT_REFRESH_SECRET || '';
    const weak = (s: string) => s.length < 32 || UNSAFE_SECRETS.some((u) => s.toLowerCase().includes(u));
    if (weak(jwtSecret) || weak(refreshSecret)) {
        logger.warn('SECURITY: JWT_SECRET or JWT_REFRESH_SECRET appears weak or default. Set strong, unique values in production.');
    }
}

const startServer = async () => {
    try {
        validateSecrets();
        await connectDB();
        automationScheduler.start();

        // Start server
        const server = app.listen(config.port, () => {
            logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Server is running on port ${config.port}                    ║
║   📝 Environment: ${config.env}                        ║
║   🌐 API Version: ${config.apiVersion}                              ║
║   📡 Health check: http://localhost:${config.port}/health        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (err: Error) => {
            logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
            logger.error('Error:', err);
            server.close(() => {
                process.exit(1);
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (err: Error) => {
            logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
            logger.error(err.name, err.message);
            process.exit(1);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('👋 SIGTERM RECEIVED. Shutting down gracefully');
            automationScheduler.stop();
            server.close(() => {
                logger.info('💥 Process terminated!');
            });
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

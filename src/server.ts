import app from './app';
import config from './config';
import connectDB from './config/database';
import logger from './utils/logger';

const startServer = async () => {
    try {
        // Connect to database
        await connectDB();

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

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

interface Config {
    env: string;
    port: number;
    apiVersion: string;
    mongodb: {
        uri: string;
        testUri: string;
    };
    jwt: {
        secret: string;
        refreshSecret: string;
        accessExpiration: string;
        refreshExpiration: string;
        cookieExpiresIn: number;
    };
    cors: {
        origin: string;
    };
    upload: {
        maxFileSize: number;
        uploadPath: string;
    };
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    email: {
        smtp: {
            host: string;
            port: number;
            user: string;
            password: string;
        };
        from: string;
    };
    security: {
        bcryptSaltRounds: number;
    };
    whm: {
        host: string;
        username: string;
        apiToken: string;
    };
    dynadot: {
        apiKey: string;
        apiSecret: string;
        baseUrl: string;
    };
    namely: {
        apiKey: string;
        baseUrl: string;
    };
}

const config: Config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    apiVersion: process.env.API_VERSION || 'v1',

    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/billing-software',
        testUri: process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/billing-software-test',
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
        accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
        refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
        cookieExpiresIn: parseInt(process.env.JWT_COOKIE_EXPIRES_IN || '7', 10),
    },

    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    },

    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB default
        uploadPath: process.env.UPLOAD_PATH || 'uploads',
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },

    email: {
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            user: process.env.SMTP_USER || '',
            password: process.env.SMTP_PASSWORD || '',
        },
        from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    },

    security: {
        bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
    },
    whm: {
        host: process.env.WHM_HOST || '',
        username: process.env.WHM_USERNAME || '',
        apiToken: process.env.WHM_API_TOKEN || '',
    },
    dynadot: {
        apiKey: process.env.DYNADOT_API_KEY || '',
        apiSecret: process.env.DYNADOT_API_SECRET || '',
        baseUrl: process.env.DYNADOT_BASE_URL || 'https://api.dynadot.com/restful/v2',
    },
    namely: {
        apiKey: process.env.NAMELY_API_KEY || '',
        baseUrl: process.env.NAMELY_BASE_URL || 'https://api.namely.com.bd/v1/partner-api',
    },
};

// Validate required environment variables in production
if (config.env === 'production') {
    const requiredEnvVars = [
        'MONGODB_URI',
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
    ];

    const missingEnvVars = requiredEnvVars.filter(
        (envVar) => !process.env[envVar]
    );

    if (missingEnvVars.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missingEnvVars.join(', ')}`
        );
    }
}

export default config;

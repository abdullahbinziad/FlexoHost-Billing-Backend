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
    cookieOnlyAuth?: boolean;
    cookieDomain?: string;
    upload: {

        maxFileSize: number;
        uploadPath: string;
        enableClamavScan?: boolean;
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
            /** Use TLS on connect (typical for port 465). Also set when SMTP_SECURE=true. */
            secure: boolean;
            /** Require STARTTLS (typical for port 587). Set SMTP_REQUIRE_TLS=false to disable. */
            requireTls: boolean;
            /** Set SMTP_TLS_REJECT_UNAUTHORIZED=false only for broken/self-signed SMTP certs (not recommended). */
            tlsRejectUnauthorized: boolean;
        };
        from: string;
        logoUrl: string;
    };
    security: {
        bcryptSaltRounds: number;
        /** CSRF protection for cookie-based auth. Default true when cookieOnlyAuth. */
        csrfEnabled: boolean;
        /** Token length in bytes (32 = 256 bits). */
        csrfTokenBytes: number;
        /** Derives AES-256 key (SHA-256) for encrypting dashboard SMTP password in MongoDB. */
        settingsEncryptionKey: string;
    };
    whm: {
        host: string;
        username: string;
        apiToken: string;
        /** When true (default), verify SSL certificates. Set WHM_REJECT_UNAUTHORIZED=false only for self-signed WHM. */
        rejectUnauthorized: boolean;
    };
    namely: {
        apiKey: string;
        baseUrl: string;
    };
    google: {
        clientId: string;
        clientSecret: string;
    };
    cron: {
        enabled: boolean;
        runOnStart: boolean;
        renewalsIntervalMs: number;
        overdueSuspensionsIntervalMs: number;
        invoiceRemindersIntervalMs: number;
        terminationsIntervalMs: number;
        usageSyncIntervalMs: number;
        actionWorkerIntervalMs: number;
        provisioningWorkerIntervalMs: number;
        domainSyncIntervalMs: number;
    };
    automationAlerts: {
        enabled: boolean;
        failureThreshold: number;
        repeatEveryFailures: number;
        sendRecovery: boolean;
        emailTo: string[];
        webhookUrl: string;
    };
    automationDigest: {
        enabled: boolean;
        emailTo: string[];
        intervalMs: number;
        periodHours: number;
        includeEmpty: boolean;
    };
    frontendUrl: string;
    /** Backend API base URL (origin) for links e.g. attachment URLs. From API_URL. */
    api: { baseUrl: string; /** Full base for API routes e.g. http://localhost:5001/api/v1 */ fullBaseUrl: string };
    /** Public website URL for support/kb links. From WEBSITE_URL or frontendUrl. */
    websiteUrl: string;
    /** Control panel URL pattern (e.g. cPanel). Used to build https://hostname:2083. */
    controlPanel: { protocol: string; port: number };
    /** App/brand for emails and UI. */
    app: { companyName: string; supportEmail: string };
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
    cookieOnlyAuth: (process.env.COOKIE_ONLY_AUTH || '').toLowerCase() === 'true',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,

    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB default
        uploadPath: process.env.UPLOAD_PATH || 'uploads',
        enableClamavScan: (process.env.ENABLE_CLAMAV_SCAN || '').toLowerCase() === 'true',
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
            secure:
                process.env.SMTP_SECURE !== undefined
                    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
                    : parseInt(process.env.SMTP_PORT || '587', 10) === 465,
            requireTls:
                process.env.SMTP_REQUIRE_TLS !== undefined
                    ? process.env.SMTP_REQUIRE_TLS.toLowerCase() === 'true'
                    : parseInt(process.env.SMTP_PORT || '587', 10) === 587,
            tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
        },
        from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
        logoUrl: process.env.EMAIL_LOGO_URL || 'https://flexohost.com/logo.png',
    },

    security: {
        bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
        csrfEnabled: (process.env.ENABLE_CSRF || '').toLowerCase() !== 'false',
        csrfTokenBytes: 32,
        settingsEncryptionKey: process.env.SETTINGS_ENCRYPTION_KEY || '',
    },
    whm: {
        host: process.env.WHM_HOST || '',
        username: process.env.WHM_USERNAME || '',
        apiToken: process.env.WHM_API_TOKEN || '',
        rejectUnauthorized: process.env.WHM_REJECT_UNAUTHORIZED !== 'false',
    },
    namely: {
        apiKey: process.env.NAMELY_API_KEY || '',
        baseUrl: process.env.NAMELY_BASE_URL || 'https://api.namely.com.bd/v1/partner-api',
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    cron: {
        enabled: (process.env.CRON_ENABLED || 'true').toLowerCase() !== 'false',
        runOnStart: (process.env.CRON_RUN_ON_START || 'false').toLowerCase() === 'true',
        renewalsIntervalMs: parseInt(process.env.CRON_RENEWALS_INTERVAL_MS || `${60 * 60 * 1000}`, 10),
        overdueSuspensionsIntervalMs: parseInt(process.env.CRON_OVERDUE_SUSPENSIONS_INTERVAL_MS || `${60 * 60 * 1000}`, 10),
        invoiceRemindersIntervalMs: parseInt(process.env.CRON_INVOICE_REMINDERS_INTERVAL_MS || `${6 * 60 * 60 * 1000}`, 10),
        terminationsIntervalMs: parseInt(process.env.CRON_TERMINATIONS_INTERVAL_MS || `${12 * 60 * 60 * 1000}`, 10),
        usageSyncIntervalMs: parseInt(process.env.CRON_USAGE_SYNC_INTERVAL_MS || `${30 * 60 * 1000}`, 10),
        actionWorkerIntervalMs: parseInt(process.env.CRON_ACTION_WORKER_INTERVAL_MS || `${5 * 60 * 1000}`, 10),
        provisioningWorkerIntervalMs: parseInt(process.env.CRON_PROVISIONING_WORKER_INTERVAL_MS || `${2 * 60 * 1000}`, 10),
        domainSyncIntervalMs: parseInt(process.env.CRON_DOMAIN_SYNC_INTERVAL_MS || `${60 * 60 * 1000}`, 10),
    },
    automationAlerts: {
        enabled: (process.env.AUTOMATION_ALERTS_ENABLED || 'true').toLowerCase() !== 'false',
        failureThreshold: parseInt(process.env.AUTOMATION_ALERT_FAILURE_THRESHOLD || '3', 10),
        repeatEveryFailures: parseInt(process.env.AUTOMATION_ALERT_REPEAT_EVERY_FAILURES || '3', 10),
        sendRecovery: (process.env.AUTOMATION_ALERT_SEND_RECOVERY || 'true').toLowerCase() !== 'false',
        emailTo: (process.env.AUTOMATION_ALERT_EMAIL_TO || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        webhookUrl: process.env.AUTOMATION_ALERT_WEBHOOK_URL || '',
    },
    automationDigest: {
        enabled: (process.env.AUTOMATION_DIGEST_ENABLED || 'true').toLowerCase() !== 'false',
        emailTo: (process.env.AUTOMATION_DIGEST_EMAIL_TO || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        intervalMs: parseInt(process.env.AUTOMATION_DIGEST_INTERVAL_MS || `${24 * 60 * 60 * 1000}`, 10),
        periodHours: parseInt(process.env.AUTOMATION_DIGEST_PERIOD_HOURS || '24', 10),
        includeEmpty: (process.env.AUTOMATION_DIGEST_INCLUDE_EMPTY || 'false').toLowerCase() === 'true',
    },
    frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
    api: {
        baseUrl: process.env.API_URL ? new URL(process.env.API_URL).origin : `http://localhost:${parseInt(process.env.PORT || '5000', 10)}`,
        fullBaseUrl: process.env.API_URL || `http://localhost:${parseInt(process.env.PORT || '5000', 10)}/api/${process.env.API_VERSION || 'v1'}`,
    },
    websiteUrl: process.env.WEBSITE_URL || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
    controlPanel: {
        protocol: process.env.CONTROL_PANEL_PROTOCOL || 'https',
        port: parseInt(process.env.CONTROL_PANEL_PORT || '2083', 10),
    },
    app: {
        companyName: process.env.COMPANY_NAME || process.env.APP_NAME || 'FlexoHost',
        supportEmail: process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || 'support@example.com',
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

    if (config.jwt.secret === 'your-secret-key' || config.jwt.refreshSecret === 'your-refresh-secret-key') {
        throw new Error('JWT secrets must be set to non-default values in production');
    }
}

// Warn when using default JWT secrets in development
if (config.env !== 'production') {
    const defaultSecrets = ['your-secret-key', 'your-refresh-secret-key'];
    if (defaultSecrets.includes(config.jwt.secret) || defaultSecrets.includes(config.jwt.refreshSecret)) {
        // eslint-disable-next-line no-console
        console.warn(
            '[Config] Using default JWT secrets. Set JWT_SECRET and JWT_REFRESH_SECRET in .env for production.'
        );
    }
}

export default config;

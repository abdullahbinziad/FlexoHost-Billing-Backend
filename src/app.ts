import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import config from './config';
import errorHandler from './middlewares/errorHandler';
import { serveUploadsWithDisposition } from './middlewares/serveUploadsWithDisposition';
import { csrfProtection } from './middlewares/csrf';
import ApiResponse from './utils/apiResponse';

// Import routes
import userRoutes from './modules/user/user.routes';
import authRoutes from './modules/auth/auth.routes';
import clientRoutes from './modules/client/client.routes';
import whmRoutes from './modules/whm/whm.routes';
import domainRoutes from './modules/domain/domain.routes';
import paymentRoutes from './modules/payment/payment.routes';
import invoiceRoutes from './modules/invoice/invoice.routes';
import orderRoutes from './modules/order/order.routes';
import serviceRoutes from './modules/services/service.routes';
import serverRoutes from './modules/server/server.routes';
import productRoutes from './modules/product/product.routes';
import promotionRoutes from './modules/promotion/promotion.routes';
import emailRoutes from './modules/email/email.routes';
import transactionRoutes from './modules/transaction/transaction.routes';
import notificationRoutes from './modules/notification/notification.routes';
import ticketRoutes from './modules/ticket/ticket.routes';
import uploadRoutes from './modules/upload/upload.routes';
import exchangeRateRoutes from './modules/exchange-rate/exchange-rate.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import activityLogRoutes from './modules/activity-log/activity-log.routes';
import affiliateRoutes from './modules/affiliate/affiliate.routes';
import settingsRoutes from './modules/settings/settings.routes';
import whmcsMigrationRoutes from './modules/whmcs-migration/whmcs-migration.routes';
import roleRoutes from './modules/role/role.routes';
import billableItemRoutes from './modules/billable-item/billable-item.routes';
import csrfRoutes from './modules/csrf/csrf.routes';


const app: Application = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
    cors({
        origin: config.cors.origin,
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Acting-As', 'X-Requested-With'],
    })
);

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter rate limit for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 min for login/register/forgot-password
    message: 'Too many authentication attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api', limiter);
app.use(`/api/${config.apiVersion}/auth`, authLimiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Compression
app.use(compression());

// Logging
if (config.env === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Serve static files (non-images get Content-Disposition: attachment)
app.use('/uploads', serveUploadsWithDisposition, express.static(path.join(process.cwd(), config.upload.uploadPath)));

// Health check route
app.get('/health', (req: Request, res: Response) => {
    void req;
    return ApiResponse.ok(res, 'Server is running', {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: config.env,
    });
});


// API routes
import storeRoutes from './modules/product/store.routes';

const apiBase = `/api/${config.apiVersion}`;

// CSRF protection for cookie-based auth (skips GET/HEAD/OPTIONS, Bearer auth, exempt paths)
app.use(apiBase, csrfProtection);
app.use(apiBase, csrfRoutes);
app.use(`${apiBase}/auth`, authRoutes);
app.use(`${apiBase}/users`, userRoutes);
app.use(`${apiBase}/clients`, clientRoutes);
app.use(`${apiBase}/whm`, whmRoutes);
app.use(`${apiBase}/domains`, domainRoutes);
app.use(`${apiBase}/payment`, paymentRoutes);
app.use(`${apiBase}/invoices`, invoiceRoutes);
app.use(`${apiBase}/orders`, orderRoutes);
app.use(`${apiBase}/services`, serviceRoutes);
app.use(`${apiBase}/servers`, serverRoutes);
app.use(`${apiBase}/admin/products`, productRoutes);
app.use(`${apiBase}/promotions`, promotionRoutes);
app.use(`${apiBase}/store/products`, storeRoutes);
app.use(`${apiBase}/email`, emailRoutes);
app.use(`${apiBase}/transactions`, transactionRoutes);
app.use(`${apiBase}/notifications`, notificationRoutes);
app.use(`${apiBase}/tickets`, ticketRoutes);
app.use(`${apiBase}/upload`, uploadRoutes);
app.use(`${apiBase}/exchange-rates`, exchangeRateRoutes);
app.use(`${apiBase}/dashboard`, dashboardRoutes);
app.use(`${apiBase}/activity-log`, activityLogRoutes);
app.use(`${apiBase}/affiliate`, affiliateRoutes);
app.use(`${apiBase}/admin/settings`, settingsRoutes);
app.use(`${apiBase}/admin/migration/whmcs`, whmcsMigrationRoutes);
app.use(`${apiBase}/roles`, roleRoutes);
app.use(`${apiBase}/billable-items`, billableItemRoutes);


// 404 handler
app.all('*', (req: Request, res: Response) => {
    return ApiResponse.notFound(res, `Route ${req.originalUrl} not found`);
});

// Global error handler
app.use(errorHandler);

export default app;

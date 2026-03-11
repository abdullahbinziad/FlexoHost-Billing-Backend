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


const app: Application = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
    cors({
        origin: config.cors.origin,
        credentials: true,
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

app.use('/api', limiter);

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

// Serve static files
app.use('/uploads', express.static(path.join(process.cwd(), config.upload.uploadPath)));

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


// 404 handler
app.all('*', (req: Request, res: Response) => {
    return ApiResponse.notFound(res, `Route ${req.originalUrl} not found`);
});

// Global error handler
app.use(errorHandler);

export default app;

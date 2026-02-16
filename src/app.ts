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
import serviceRoutes from './modules/service/service.routes';
import serverRoutes from './modules/server/server.routes';


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
app.use(`/api/${config.apiVersion}/auth`, authRoutes);
app.use(`/api/${config.apiVersion}/users`, userRoutes);
app.use(`/api/${config.apiVersion}/clients`, clientRoutes);
app.use(`/api/${config.apiVersion}/whm`, whmRoutes);
app.use(`/api/${config.apiVersion}/domains`, domainRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/servers', serverRoutes);


// 404 handler
app.all('*', (req: Request, res: Response) => {
    return ApiResponse.notFound(res, `Route ${req.originalUrl} not found`);
});

// Global error handler
app.use(errorHandler);

export default app;

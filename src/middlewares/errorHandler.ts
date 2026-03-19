import { Request, Response, NextFunction } from 'express';
import config from '../config';
import logger from '../utils/logger';
import ApiError from '../utils/apiError';

const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    void req;
    void next;
    let error = err;

    // Log the raw error for debugging in development
    if (config.env === 'development') {
        logger.error(`[Raw Error] ${err.name}: ${err.message}`, { stack: err.stack, originalError: err });
    }

    // Handle Mongoose specific errors before treating as generic
    if (!(error instanceof ApiError)) {
        if (err.name === 'CastError') {
            const message = `Invalid ${err.path}: ${err.value}`;
            error = new ApiError(400, message, true, err.stack);
        } else if (err.code === 11000) {
            // MongoDB duplicate key error
            const val = err.errmsg ? err.errmsg.match(/(["'])(\\?.)*?\1/) : 'Duplicate value';
            const safeVal = val && val[0] ? val[0] : 'Duplicate value';
            const message = `Duplicate field value entered: ${safeVal}. Please use another value!`;
            error = new ApiError(400, message, true, err.stack);
        } else if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map((el: any) => el.message);
            const message = `Invalid input data. ${errors.join('. ')}`;
            error = new ApiError(400, message, true, err.stack);
        } else if (err.name === 'JsonWebTokenError') {
            error = new ApiError(401, 'Invalid token. Please log in again!', true, err.stack);
        } else if (err.name === 'TokenExpiredError') {
            error = new ApiError(401, 'Your token has expired! Please log in again.', true, err.stack);
        } else {
            // Default 500 for unhandled errors
            const statusCode = error.statusCode || 500;
            const message = error.message || 'Internal Server Error';
            error = new ApiError(statusCode, message, false, err.stack);
        }
    }

    // Ensure production doesn't leak sensitive unhandled error data
    if (config.env === 'production' && !error.isOperational) {
        logger.error(`[Unhandled Internal Error] ${error.message} \n${error.stack}`);
        error.message = 'Something went wrong on our end. Please try again later.';
    }

    // Log operational errors normally
    if (error.isOperational) {
        logger.error(`[Operational Error]: ${error.message}`);
    }

    // Send error response
    const response = {
        success: false,
        message: error.message,
        ...(config.env === 'development' && { stack: error.stack }),
    };

    return res.status(error.statusCode).json(response);
};

export default errorHandler;

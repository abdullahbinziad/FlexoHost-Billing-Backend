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

    // If it's not an ApiError, convert it
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal Server Error';
        error = new ApiError(statusCode, message, false, err.stack);
    }

    // Log error
    logger.error(`Error: ${error.message}`);
    if (error.stack) {
        logger.error(error.stack);
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

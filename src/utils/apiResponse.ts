import { Response } from 'express';

interface ApiResponseData {
    success: boolean;
    message?: string;
    data?: any;
    error?: any;
    stack?: string;
}

class ApiResponse {
    static success(res: Response, statusCode: number, message: string, data?: any) {
        const response: ApiResponseData = {
            success: true,
            message,
        };

        if (data !== undefined) {
            response.data = data;
        }

        return res.status(statusCode).json(response);
    }

    static error(res: Response, statusCode: number, message: string, error?: any, stack?: string) {
        const response: ApiResponseData = {
            success: false,
            message,
        };

        if (error !== undefined) {
            response.error = error;
        }

        if (stack !== undefined) {
            response.stack = stack;
        }

        return res.status(statusCode).json(response);
    }

    static created(res: Response, message: string, data?: any) {
        return this.success(res, 201, message, data);
    }

    static ok(res: Response, message: string, data?: any) {
        return this.success(res, 200, message, data);
    }

    static badRequest(res: Response, message: string, error?: any) {
        return this.error(res, 400, message, error);
    }

    static unauthorized(res: Response, message: string = 'Unauthorized') {
        return this.error(res, 401, message);
    }

    static forbidden(res: Response, message: string = 'Forbidden') {
        return this.error(res, 403, message);
    }

    static notFound(res: Response, message: string = 'Resource not found') {
        return this.error(res, 404, message);
    }

    static conflict(res: Response, message: string, error?: any) {
        return this.error(res, 409, message, error);
    }

    static internalError(res: Response, message: string = 'Internal server error', error?: any, stack?: string) {
        return this.error(res, 500, message, error, stack);
    }
}

export default ApiResponse;

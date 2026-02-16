class ApiError extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(statusCode: number, message: string, isOperational = true, stack = '') {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    static badRequest(message: string) {
        return new ApiError(400, message);
    }

    static unauthorized(message: string = 'Unauthorized') {
        return new ApiError(401, message);
    }

    static forbidden(message: string = 'Forbidden') {
        return new ApiError(403, message);
    }

    static notFound(message: string = 'Resource not found') {
        return new ApiError(404, message);
    }

    static conflict(message: string) {
        return new ApiError(409, message);
    }

    static internalError(message: string = 'Internal server error') {
        return new ApiError(500, message);
    }

    static validationError(message: string) {
        return new ApiError(422, message);
    }
}

export default ApiError;

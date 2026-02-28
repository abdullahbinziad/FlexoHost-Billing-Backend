import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import ApiError from '../utils/apiError';
import catchAsync from '../utils/catchAsync';
import User from '../modules/user/user.model';

export interface AuthRequest extends Request {
    user?: any;
}

export const protect = catchAsync(
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        void res;
        let token: string | undefined;

        // Check for token in Authorization header
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }
        // Check for token in cookies
        else if (req.cookies?.jwt) {
            token = req.cookies.jwt;
        }

        if (!token) {
            throw ApiError.unauthorized('You are not logged in. Please log in to get access.');
        }

        // Verify token
        const decoded = jwt.verify(token, config.jwt.secret) as { id: string; iat: number };

        // Check if user still exists
        const currentUser = await User.findById(decoded.id).select('+active');

        if (!currentUser) {
            throw ApiError.unauthorized('The user belonging to this token no longer exists.');
        }

        // Check if user is active
        if (!currentUser.active) {
            throw ApiError.unauthorized('Your account has been deactivated. Please contact support.');
        }

        // Check if user changed password after the token was issued
        if (currentUser.changedPasswordAfter(decoded.iat)) {
            throw ApiError.unauthorized('User recently changed password. Please log in again.');
        }

        // Grant access to protected route
        req.user = currentUser;
        next();
    }
);

export const restrictTo = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        void res;
        if (!req.user || !roles.includes(req.user.role)) {
            throw ApiError.forbidden('You do not have permission to perform this action.');
        }
        next();
    };
};

export const optionalAuth = catchAsync(
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        void res;
        let token: string | undefined;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies?.jwt) {
            token = req.cookies.jwt;
        }

        if (!token) {
            return next();
        }

        try {
            const decoded = jwt.verify(token, config.jwt.secret) as { id: string; iat: number };
            const currentUser = await User.findById(decoded.id).select('+active');

            if (currentUser && currentUser.active && !currentUser.changedPasswordAfter(decoded.iat)) {
                req.user = currentUser;
            }
        } catch (error) {
            // Ignore token verification errors for optional auth
        }

        next();
    }
);

import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import config from '../../config';
import { IUser, IAuthTokens } from './user.interface';

export const generateAccessToken = (userId: string): string => {
    return jwt.sign({ id: userId }, config.jwt.secret as Secret, {
        expiresIn: config.jwt.accessExpiration as SignOptions['expiresIn'],
    });
};

export const generateRefreshToken = (userId: string): string => {
    return jwt.sign({ id: userId }, config.jwt.refreshSecret as Secret, {
        expiresIn: config.jwt.refreshExpiration as SignOptions['expiresIn'],
    });
};

export const generateAuthTokens = (userId: string): IAuthTokens => {
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    return {
        accessToken,
        refreshToken,
    };
};

export const verifyRefreshToken = (token: string): { id: string } => {
    return jwt.verify(token, config.jwt.refreshSecret) as { id: string };
};

export const sanitizeUser = (user: IUser): any => {
    const userObject = user.toObject();

    // Remove sensitive fields
    delete userObject.password;
    delete userObject.passwordResetToken;
    delete userObject.passwordResetExpires;
    delete userObject.verificationToken;
    delete userObject.verificationTokenExpires;
    delete userObject.refreshToken;
    delete userObject.loginAttempts;
    delete userObject.lockUntil;
    delete userObject.__v;

    return userObject;
};

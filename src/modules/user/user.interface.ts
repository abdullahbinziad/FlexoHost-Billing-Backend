import { Document } from 'mongoose';

export type AuthProvider = 'local' | 'google' | 'facebook' | 'github';

export interface IUser extends Document {
    email: string;
    password?: string;
    /** @deprecated Use provider + providerId. Kept for backward compatibility. */
    googleId?: string;
    provider?: AuthProvider;
    providerId?: string;
    role: 'admin' | 'user' | 'moderator';
    active: boolean;
    verified: boolean;
    verificationToken?: string;
    verificationTokenExpires?: Date;
    passwordChangedAt?: Date;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    loginAttempts: number;
    lockUntil?: Date;
    refreshToken?: string;
    createdAt: Date;
    updatedAt: Date;

    // Instance methods
    comparePassword(candidatePassword: string): Promise<boolean>;
    changedPasswordAfter(JWTTimestamp: number): boolean;
    createPasswordResetToken(): string;
    createVerificationToken(): string;
    incrementLoginAttempts(): Promise<void>;
    resetLoginAttempts(): Promise<void>;
    isLocked(): boolean;
}

export interface IUserCreate {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role?: 'admin' | 'user' | 'moderator';
    phone?: string;
    companyName?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        postCode?: string;
    };
}

export interface IUserUpdate {
    email?: string;
}

export interface IUserLogin {
    email: string;
    password: string;
}

export interface IUserResponse {
    _id: string;
    email: string;
    role: string;
    verified: boolean;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAuthTokens {
    accessToken: string;
    refreshToken: string;
}

import { Document } from 'mongoose';

export interface IUser extends Document {
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'user' | 'moderator';
    avatar?: string;
    phone?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        zipCode?: string;
    };
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
    name: string;
    email: string;
    password: string;
    role?: 'admin' | 'user' | 'moderator';
    phone?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        zipCode?: string;
    };
}

export interface IUserUpdate {
    name?: string;
    email?: string;
    phone?: string;
    avatar?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        zipCode?: string;
    };
}

export interface IUserLogin {
    email: string;
    password: string;
}

export interface IUserResponse {
    _id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
    phone?: string;
    address?: any;
    verified: boolean;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAuthTokens {
    accessToken: string;
    refreshToken: string;
}

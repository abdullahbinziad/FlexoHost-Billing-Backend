import mongoose from 'mongoose';
import crypto from 'crypto';
import User from './user.model';
import Client from '../client/client.model';
import ApiError from '../../utils/apiError';
import {
    IUserCreate,
    IUserUpdate,
    IUserLogin,
    IAuthTokens,
} from './user.interface';
import { generateAuthTokens, verifyRefreshToken, sanitizeUser } from './user.helper';
import emailService from '../email/email.service';
import logger from '../../utils/logger';

class UserService {
    // Register new user
    async register(userData: IUserCreate): Promise<{ user: any; tokens: IAuthTokens }> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Check if user already exists
            const existingUser = await User.findOne({ email: userData.email }).session(session);
            if (existingUser) {
                throw ApiError.conflict('Email already registered');
            }

            // Create user (only auth fields)
            const [user] = await User.create([{
                email: userData.email,
                password: userData.password,
            }], { session });

            // Generate verification token
            const rawVerificationToken = user.createVerificationToken();
            await user.save({ session, validateBeforeSave: false });

            // Create Client Profile
            await Client.create([{
                user: user._id,
                firstName: userData.firstName,
                lastName: userData.lastName,
                companyName: userData.companyName,
                address: userData.address,
            }], { session });

            // Send emails (non-blocking)
            try {
                await emailService.sendWelcomeEmail(user.email, userData.firstName + ' ' + userData.lastName);
                if (rawVerificationToken) {
                    await emailService.sendVerificationEmail(user.email, userData.firstName + ' ' + userData.lastName, rawVerificationToken);
                }
            } catch (emailError) {
                logger.error('Failed to send registration emails:', emailError);
            }

            // Generate auth tokens
            const tokens = generateAuthTokens(user._id.toString());

            // Save refresh token
            user.refreshToken = tokens.refreshToken;
            await user.save({ session, validateBeforeSave: false });

            await session.commitTransaction();

            return {
                user: sanitizeUser(user),
                tokens,
            };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    // Login user
    async login(credentials: IUserLogin): Promise<{ user: any; tokens: IAuthTokens }> {
        const { email, password } = credentials;

        // Find user and include password
        const user = await User.findOne({ email })
            .select('+password +active');

        if (!user) {
            throw ApiError.unauthorized('Invalid email or password');
        }

        // Check if account is locked (DISABLED FOR NOW)
        // if (user.isLocked()) {
        //     throw ApiError.unauthorized(
        //         'Account is locked due to too many failed login attempts. Please try again later.'
        //     );
        // }

        // Check if account is active
        if (!user.active) {
            throw ApiError.unauthorized('Your account has been deactivated');
        }

        // Verify password
        const isPasswordCorrect = await user.comparePassword(password);

        if (!isPasswordCorrect) {
            // await user.incrementLoginAttempts(); // DISABLED FOR NOW
            throw ApiError.unauthorized('Invalid email or password');
        }

        // Fetch Client Profile to include in payload
        const clientProfile = await Client.findOne({ user: user._id }).lean();

        // Reset login attempts on successful login (DISABLED FOR NOW)
        // if (user.loginAttempts > 0) {
        //     await user.resetLoginAttempts();
        // }

        // Generate auth tokens
        const tokens = generateAuthTokens(user._id.toString());

        // Save refresh token
        user.refreshToken = tokens.refreshToken;
        await user.save({ validateBeforeSave: false });

        const sanitizedUser = sanitizeUser(user);

        return {
            user: { ...sanitizedUser, client: clientProfile },
            tokens,
        };
    }

    // Refresh access token
    async refreshToken(refreshToken: string): Promise<IAuthTokens> {
        try {
            // Verify refresh token
            const decoded = verifyRefreshToken(refreshToken);

            // Find user
            const user = await User.findById(decoded.id).select('+refreshToken');

            if (!user) {
                throw ApiError.unauthorized('Invalid refresh token');
            }

            // Check if refresh token matches
            if (user.refreshToken !== refreshToken) {
                throw ApiError.unauthorized('Invalid refresh token');
            }

            // Generate new tokens
            const tokens = generateAuthTokens(user._id.toString());

            // Update refresh token
            user.refreshToken = tokens.refreshToken;
            await user.save({ validateBeforeSave: false });

            return tokens;
        } catch (error) {
            throw ApiError.unauthorized('Invalid refresh token');
        }
    }

    // Logout user
    async logout(userId: string): Promise<void> {
        await User.findByIdAndUpdate(userId, { refreshToken: null });
    }

    // Get user by ID
    async getUserById(
        userId: string,
        options: { includeInactive?: boolean } = {}
    ): Promise<any> {
        const query = User.findById(userId).select('+active');

        if (options.includeInactive) {
            query.setOptions({ includeInactive: true });
        }

        const user = await query;

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        const clientProfile = await Client.findOne({ user: user._id }).lean();
        const sanitizedUser = sanitizeUser(user);

        return { ...sanitizedUser, client: clientProfile };
    }

    // Update user
    async updateUser(userId: string, updateData: IUserUpdate): Promise<any> {
        // Prevent updating sensitive fields
        const allowedUpdates = ['email'];
        const updates = Object.keys(updateData);
        const isValidOperation = updates.every((update) =>
            allowedUpdates.includes(update)
        );

        if (!isValidOperation) {
            throw ApiError.badRequest('Invalid updates. Profile updates like name and address must be done through the Client profile.');
        }

        const user = await User.findByIdAndUpdate(userId, updateData, {
            new: true,
            runValidators: true,
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        return sanitizeUser(user);
    }

    // Update user (admin only)
    async updateUserByAdmin(userId: string, updateData: any): Promise<any> {
        const allowedUpdates = [
            'email',
            'role',
            'active',
            'verified',
        ];

        const updates = Object.keys(updateData);
        const isValidOperation = updates.every((update) => allowedUpdates.includes(update));

        if (!isValidOperation) {
            throw ApiError.badRequest('Invalid updates. Contact information updates must go through the Client service.');
        }

        if (updateData.email) {
            const existingUser = await User.findOne({
                email: updateData.email,
                _id: { $ne: userId },
            }).setOptions({ includeInactive: true });

            if (existingUser) {
                throw ApiError.conflict('Email already registered');
            }
        }

        const user = await User.findByIdAndUpdate(userId, updateData, {
            new: true,
            runValidators: true,
        })
            .select('+active')
            .setOptions({ includeInactive: true });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        return sanitizeUser(user);
    }

    // Change password
    async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string
    ): Promise<void> {
        const user = await User.findById(userId).select('+password');

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        // Verify current password
        const isPasswordCorrect = await user.comparePassword(currentPassword);

        if (!isPasswordCorrect) {
            throw ApiError.unauthorized('Current password is incorrect');
        }

        // Update password
        user.password = newPassword;
        await user.save();
    }

    // Forgot password
    async forgotPassword(email: string): Promise<string> {
        const user = await User.findOne({ email });

        if (!user) {
            throw ApiError.notFound('No user found with that email');
        }

        // Generate reset token
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        try {
            const client = await Client.findOne({ user: user._id }).lean();
            const displayName = client
                ? `${(client.firstName || '').trim()} ${(client.lastName || '').trim()}`.trim() || 'User'
                : 'User';
            await emailService.sendPasswordResetEmail(user.email, displayName, resetToken);
        } catch (emailError) {
            logger.error('Failed to send password reset email:', emailError);
        }

        return resetToken;
    }

    // Reset password
    async resetPassword(token: string, newPassword: string): Promise<void> {
        // Hash token
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid token
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        }).select('+passwordResetToken +passwordResetExpires');

        if (!user) {
            throw ApiError.badRequest('Invalid or expired reset token');
        }

        // Update password
        user.password = newPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
    }

    // Verify email
    async verifyEmail(token: string): Promise<void> {
        // Hash token
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid token
        const user = await User.findOne({
            verificationToken: hashedToken,
            verificationTokenExpires: { $gt: Date.now() },
        }).select('+verificationToken +verificationTokenExpires');

        if (!user) {
            throw ApiError.badRequest('Invalid or expired verification token');
        }

        // Update user
        user.verified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save({ validateBeforeSave: false });
    }

    // Get all users (admin only)
    async getAllUsers(
        page: number = 1,
        limit: number = 10,
        filters: any = {}
    ): Promise<{ users: any[]; total: number; page: number; pages: number }> {
        const skip = (page - 1) * limit;

        const users = await User.find(filters)
            .select('+active')
            .setOptions({ includeInactive: true })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(filters).setOptions({ includeInactive: true });

        return {
            users: users.map((user) => sanitizeUser(user)),
            total,
            page,
            pages: Math.ceil(total / limit),
        };
    }

    // Delete user (soft delete)
    async deleteUser(userId: string): Promise<void> {
        const user = await User.findByIdAndUpdate(
            userId,
            { active: false },
            { new: true }
        );

        if (!user) {
            throw ApiError.notFound('User not found');
        }
    }

    // Permanently delete user (admin only)
    async permanentlyDeleteUser(userId: string): Promise<void> {
        const user = await User.findByIdAndDelete(userId).setOptions({ includeInactive: true });

        if (!user) {
            throw ApiError.notFound('User not found');
        }
    }
}

export default new UserService();

import mongoose from 'mongoose';
import Client from './client.model';
import User from '../user/user.model';
import ApiError from '../../utils/apiError';
import { IRegisterClientData, IClientUpdate } from './client.interface';
import { USER_ROLES } from '../user/user.const';
import { generateAuthTokens } from '../user/user.helper';
import { sanitizeUser } from '../user/user.helper';

import emailService from '../email/email.service';
import logger from '../../utils/logger';
import { getPagination } from '../../utils/pagination';

class ClientService {
    /**
     * Generate a unique 6-digit numeric support PIN.
     * Ensures no other client currently has the same PIN.
     */
    private async generateUniqueSupportPin(): Promise<string> {
        // In practice the chance of repeated collisions is extremely low,
        // but we still cap retries to avoid an infinite loop.
        const MAX_RETRIES = 20;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const pin = Math.floor(Math.random() * 1_000_000)
                .toString()
                .padStart(6, '0');

            const exists = await Client.exists({ supportPin: pin });
            if (!exists) {
                return pin;
            }
        }

        throw ApiError.internalError('Failed to generate a unique support PIN. Please try again.');
    }

    /**
     * Register a new client with atomic transaction
     * If user exists, use existing user; otherwise create new user
     */
    async registerClient(data: IRegisterClientData): Promise<any> {
        const { userData, clientData } = data;
        const session = await mongoose.startSession();
        session.startTransaction();

        let rawVerificationToken: string | null = null;
        let isNewUser = false;
        let user: any;

        try {
            // Step 1: Check if user already exists
            const existingUser = await User.findOne({ email: userData.email }).session(session);

            if (existingUser) {
                // Use existing user
                user = existingUser;

                // Check if this user already has a client profile
                const existingClient = await Client.findOne({ user: user._id }).session(session);
                if (existingClient) {
                    throw ApiError.conflict('A client profile already exists for this user');
                }
            } else {
                // Create new user
                isNewUser = true;
                const newUserData = {
                    email: userData.email,
                    password: userData.password,
                    role: USER_ROLES.CLIENT,
                    verified: false,
                    active: true,
                };

                const [createdUser] = await User.create([newUserData], { session });
                user = createdUser;

                // Generate verification token
                rawVerificationToken = user.createVerificationToken();
                await user.save({ session });
            }

            // Step 2: Create client profile (full registration = profile complete)
            const clientProfile = {
                user: user._id,
                firstName: clientData.firstName,
                lastName: clientData.lastName,
                companyName: clientData.companyName,
                contactEmail: clientData.contactEmail,
                phoneNumber: clientData.phoneNumber,
                avatar: clientData.avatar,
                address: clientData.address,
                profileCompletedAt: new Date(),
            };

            const [client] = await Client.create([clientProfile], { session });

            // Commit transaction
            await session.commitTransaction();

            // Populate user details
            const populatedClient = await Client.findById(client._id)
                .populate('user', 'email role verified active createdAt')
                .lean();

            // Send emails for new users
            if (isNewUser) {
                try {
                    await emailService.sendWelcomeEmail(user.email, user.name);
                    if (rawVerificationToken) {
                        await emailService.sendVerificationEmail(user.email, user.name, rawVerificationToken);
                    }
                } catch (emailError) {
                    logger.error('Failed to send registration emails:', emailError);
                    // We don't fail the registration if email fails, just log it
                }
            }

            // Generate tokens for auto-login after registration
            const tokens = generateAuthTokens(user._id.toString(), user.role);
            user.refreshToken = tokens.refreshToken;
            await user.save({ validateBeforeSave: false });

            const sanitizedUser = sanitizeUser(user);

            return {
                client: populatedClient,
                user: { ...sanitizedUser, client: populatedClient, profileCompleted: true },
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                isNewUser,
                message: isNewUser
                    ? 'Client registered successfully with new user account'
                    : 'Client profile created for existing user',
            };
        } catch (error: any) {
            // Rollback transaction on error
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Get client by ID
     */
    async getClientById(clientId: string): Promise<any> {
        const client = await Client.findById(clientId)
            .populate('user', 'email role verified active createdAt')
            .lean();

        if (!client) {
            throw ApiError.notFound('Client not found');
        }

        return client;
    }

    /**
     * Get client by user ID
     */
    async getClientByUserId(userId: string): Promise<any> {
        const client = await Client.findOne({ user: userId })
            .populate('user', 'email role verified active createdAt')
            .lean();

        if (!client) {
            throw ApiError.notFound('Client profile not found for this user');
        }

        return client;
    }

    /**
     * Get or generate support PIN for the current client (by user id)
     */
    async getOrCreateSupportPinForUser(userId: string): Promise<{ supportPin: string; lastGeneratedAt: Date }> {
        const client = await Client.findOne({ user: userId });
        if (!client) {
            throw ApiError.notFound('Client profile not found for this user');
        }

        if (!client.supportPin) {
            client.supportPin = await this.generateUniqueSupportPin();
            client.supportPinLastGeneratedAt = new Date();
            await client.save();
        }

        return {
            supportPin: client.supportPin,
            lastGeneratedAt: client.supportPinLastGeneratedAt || client.updatedAt,
        };
    }

    /**
     * Regenerate support PIN for the current client (by user id)
     */
    async regenerateSupportPinForUser(userId: string): Promise<{ supportPin: string; lastGeneratedAt: Date }> {
        const client = await Client.findOne({ user: userId });
        if (!client) {
            throw ApiError.notFound('Client profile not found for this user');
        }

        client.supportPin = await this.generateUniqueSupportPin();
        client.supportPinLastGeneratedAt = new Date();
        await client.save();

        return {
            supportPin: client.supportPin,
            lastGeneratedAt: client.supportPinLastGeneratedAt,
        };
    }

    /**
     * Regenerate support PIN for a specific client (admin/staff triggered).
     */
    async regenerateSupportPinForClient(clientId: string): Promise<{ supportPin: string; lastGeneratedAt: Date }> {
        const client = await Client.findById(clientId);
        if (!client) {
            throw ApiError.notFound('Client not found');
        }

        client.supportPin = await this.generateUniqueSupportPin();
        client.supportPinLastGeneratedAt = new Date();
        await client.save();

        return {
            supportPin: client.supportPin,
            lastGeneratedAt: client.supportPinLastGeneratedAt,
        };
    }

    /**
     * Find client by support PIN (for admin/staff verification)
     */
    async findClientBySupportPin(pin: string): Promise<any> {
        const client = await Client.findOne({ supportPin: pin })
            .populate('user', 'email active createdAt')
            .lean();

        if (!client) {
            throw ApiError.notFound('Client not found for this support PIN');
        }

        return client;
    }

    /**
     * Get client by clientId (auto-increment number)
     */
    async getClientByClientId(clientId: number): Promise<any> {
        const client = await Client.findOne({ clientId })
            .populate('user', 'email role verified active createdAt')
            .lean();

        if (!client) {
            throw ApiError.notFound('Client not found');
        }

        return client;
    }

    /**
     * Get all clients with pagination.
     * `search` matches first/last/full name, company, email, phone.
     * `supportPin` (if provided) must match exactly.
     */
    async getAllClients(
        page: number = 1,
        limit: number = 10,
        filters: any = {}
    ): Promise<{ clients: any[]; total: number; page: number; pages: number }> {
        const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });

        const query: any = {};

        const search = (filters.search || '').trim();
        const supportPin = (filters.supportPin || '').trim();

        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');
            query.$or = [
                { firstName: { $regex: regex } },
                { lastName: { $regex: regex } },
                { companyName: { $regex: regex } },
                { contactEmail: { $regex: regex } },
                { phoneNumber: { $regex: regex } },
                {
                    $expr: {
                        $regexMatch: {
                            input: { $concat: ['$firstName', ' ', '$lastName'] },
                            regex: escaped,
                            options: 'i',
                        },
                    },
                },
            ];
        }

        if (supportPin) {
            query.supportPin = supportPin;
        }

        const [clients, total] = await Promise.all([
            Client.find(query)
                .populate('user', 'email role verified active createdAt')
                .skip(skip)
                .limit(safeLimit)
                .sort({ createdAt: -1 })
                .lean(),
            Client.countDocuments(query),
        ]);

        return {
            clients,
            total,
            page: safePage,
            pages: Math.ceil(total / safeLimit) || 1,
        };
    }

    /**
     * Update client profile
     */
    async updateClient(clientId: string, updateData: IClientUpdate): Promise<any> {
        const client = await Client.findByIdAndUpdate(clientId, updateData, {
            new: true,
            runValidators: true,
        }).populate('user', 'email role verified active createdAt');

        if (!client) {
            throw ApiError.notFound('Client not found');
        }

        return client;
    }

    /**
     * Complete profile for the current user's client (post–social signup).
     * Updates allowed fields and sets profileCompletedAt.
     */
    async completeProfile(userId: string, data: IClientUpdate): Promise<any> {
        const client = await Client.findOne({ user: userId });
        if (!client) {
            throw ApiError.notFound('Client profile not found for this user');
        }
        const updateData = { ...data, profileCompletedAt: new Date() };
        const updated = await Client.findByIdAndUpdate(client._id, updateData, {
            new: true,
            runValidators: true,
        }).populate('user', 'email role verified active createdAt').lean();
        return updated;
    }

    /**
     * Delete client (soft delete by deactivating user)
     */
    async deleteClient(clientId: string): Promise<void> {
        const client = await Client.findById(clientId);

        if (!client) {
            throw ApiError.notFound('Client not found');
        }

        // Deactivate the associated user account
        await User.findByIdAndUpdate(client.user, { active: false });
    }

    /**
     * Permanently delete client and associated user
     */
    async permanentlyDeleteClient(clientId: string): Promise<void> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const client = await Client.findById(clientId).session(session);

            if (!client) {
                throw ApiError.notFound('Client not found');
            }

            // Delete client profile
            await Client.findByIdAndDelete(clientId).session(session);

            // Delete associated user
            await User.findByIdAndDelete(client.user).session(session);

            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
}

export default new ClientService();

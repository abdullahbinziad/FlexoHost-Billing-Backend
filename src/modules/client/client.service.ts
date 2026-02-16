import mongoose from 'mongoose';
import Client from './client.model';
import User from '../user/user.model';
import ApiError from '../../utils/apiError';
import { IRegisterClientData, IClientUpdate } from './client.interface';
import { USER_ROLES } from '../user/user.const';

import emailService from '../email/email.service';
import logger from '../../utils/logger';

class ClientService {
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
                    name: `${clientData.firstName} ${clientData.lastName}`,
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

            // Step 2: Create client profile
            const clientProfile = {
                user: user._id,
                firstName: clientData.firstName,
                lastName: clientData.lastName,
                companyName: clientData.companyName,
                contactEmail: clientData.contactEmail,
                address: clientData.address,
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

            return {
                client: populatedClient,
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
     * Get all clients with pagination
     */
    async getAllClients(
        page: number = 1,
        limit: number = 10,
        filters: any = {}
    ): Promise<{ clients: any[]; total: number; page: number; pages: number }> {
        const skip = (page - 1) * limit;

        const query: any = {};

        // Add filters
        if (filters.companyName) {
            query.companyName = { $regex: filters.companyName, $options: 'i' };
        }
        if (filters.firstName) {
            query.firstName = { $regex: filters.firstName, $options: 'i' };
        }
        if (filters.lastName) {
            query.lastName = { $regex: filters.lastName, $options: 'i' };
        }

        const clients = await Client.find(query)
            .populate('user', 'email role verified active createdAt')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .lean();

        const total = await Client.countDocuments(query);

        return {
            clients,
            total,
            page,
            pages: Math.ceil(total / limit),
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

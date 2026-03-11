import mongoose, { Schema } from 'mongoose';
import { IClient } from './client.interface';

const addressSchema = new Schema(
    {
        street: {
            type: String,
            trim: true,
        },
        city: {
            type: String,
            trim: true,
        },
        state: {
            type: String,
            trim: true,
        },
        postCode: {
            type: String,
            trim: true,
        },
        country: {
            type: String,
            trim: true,
        },
    },
    { _id: false }
);

const clientSchema = new Schema<IClient>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User reference is required'],
            unique: true,
            index: true,
        },
        clientId: {
            type: Number,
            unique: true,
            index: true,
        },
        firstName: {
            type: String,
            required: [true, 'First name is required'],
            trim: true,
            minlength: [2, 'First name must be at least 2 characters'],
            maxlength: [50, 'First name cannot exceed 50 characters'],
        },
        lastName: {
            type: String,
            required: [true, 'Last name is required'],
            trim: true,
            minlength: [2, 'Last name must be at least 2 characters'],
            maxlength: [50, 'Last name cannot exceed 50 characters'],
        },
        companyName: {
            type: String,
            trim: true,
            maxlength: [100, 'Company name cannot exceed 100 characters'],
        },
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
            match: [
                /^\w+([-.]?\w+)*@\w+([-.]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid contact email',
            ],
        },
        phoneNumber: {
            type: String,
            default: null,
        },
        avatar: {
            type: String,
            default: null,
        },
        address: {
            type: addressSchema,
            default: {},
        },
        // 6-digit numeric support PIN used for verifying callers
        supportPin: {
            type: String,
            length: 6,
            index: true,
            unique: true,
            sparse: true,
        },
        supportPinLastGeneratedAt: {
            type: Date,
        },
        supportPinLastVerifiedAt: {
            type: Date,
        },
        profileCompletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Auto-increment clientId before saving (atomic counter)
clientSchema.pre('save', async function (next) {
    if (this.isNew && !this.clientId) {
        try {
            const { getNextSequence } = await import('../../models/counter.model');
            const seq = await getNextSequence('client');
            this.clientId = 999 + seq; // seq=1 => clientId=1000, seq=2 => 1001, ...
        } catch (error) {
            return next(error as Error);
        }
    }
    next();
});

// Virtual for full name
clientSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

const Client = mongoose.model<IClient>('Client', clientSchema);

export default Client;

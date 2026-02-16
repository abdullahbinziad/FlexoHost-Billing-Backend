import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import config from '../../config';
import { IUser } from './user.interface';
import { USER_ROLES, MAX_LOGIN_ATTEMPTS, LOCK_TIME } from './user.const';

const userSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 characters'],
            maxlength: [50, 'Name cannot exceed 50 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^\w+([-.]?\w+)*@\w+([-.]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid email',
            ],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false,
        },
        role: {
            type: String,
            enum: Object.values(USER_ROLES),
            default: USER_ROLES.USER,
        },
        avatar: {
            type: String,
            default: null,
        },
        phone: {
            type: String,
            default: null,
        },
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            zipCode: String,
        },
        active: {
            type: Boolean,
            default: true,
            select: false,
        },
        verified: {
            type: Boolean,
            default: false,
        },
        verificationToken: {
            type: String,
            select: false,
        },
        verificationTokenExpires: {
            type: Date,
            select: false,
        },
        passwordChangedAt: {
            type: Date,
            select: false,
        },
        passwordResetToken: {
            type: String,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false,
        },
        loginAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        lockUntil: {
            type: Date,
            select: false,
        },
        refreshToken: {
            type: String,
            select: false,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Indexes

userSchema.index({ role: 1 });
userSchema.index({ active: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    // Only run if password was modified
    if (!this.isModified('password')) return next();

    // Hash password
    this.password = await bcrypt.hash(this.password, config.security.bcryptSaltRounds);

    // Set passwordChangedAt
    if (!this.isNew) {
        this.passwordChangedAt = new Date(Date.now() - 1000);
    }

    next();
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp: number): boolean {
    if (this.passwordChangedAt) {
        const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
        return JWTTimestamp < changedTimestamp;
    }
    return false;
};

// Instance method to create password reset token
userSchema.methods.createPasswordResetToken = function (): string {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    return resetToken;
};

// Instance method to create verification token
userSchema.methods.createVerificationToken = function (): string {
    const verificationToken = crypto.randomBytes(32).toString('hex');

    this.verificationToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');

    this.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    return verificationToken;
};

// Instance method to increment login attempts
userSchema.methods.incrementLoginAttempts = async function (): Promise<void> {
    // If lock has expired, reset attempts
    if (this.lockUntil && this.lockUntil < new Date()) {
        await this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 },
        });
        return;
    }

    const updates: any = { $inc: { loginAttempts: 1 } };

    // Lock account after max attempts
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.lockUntil) {
        updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
    }

    await this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = async function (): Promise<void> {
    await this.updateOne({
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1 },
    });
};

// Instance method to check if account is locked
userSchema.methods.isLocked = function (): boolean {
    return !!(this.lockUntil && this.lockUntil > new Date());
};

// Query middleware to exclude inactive users by default
userSchema.pre(/^find/, function (this: any, next) {
    // Allow bypassing the default "active" filter for admin operations
    const options = this.getOptions ? this.getOptions() : {};
    const filter = this.getFilter ? this.getFilter() : {};

    if (options?.includeInactive) {
        return next();
    }

    // If the query already specifies `active`, don't override it.
    if (filter && Object.prototype.hasOwnProperty.call(filter, 'active')) {
        return next();
    }

    this.where({ active: { $ne: false } });
    next();
});

const User = mongoose.model<IUser>('User', userSchema);

export default User;

import mongoose, { Schema } from 'mongoose';
import { ITLD } from './tld.interface';

const tldSchema = new Schema<ITLD>({
    tld: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    isSpotlight: {
        type: Boolean,
        default: false
    },
    label: {
        type: String
    },
    register: {
        type: String,
        required: true,
        trim: true
    },
    serial: {
        type: Number,
        default: 0
    },
    pricing: [{
        _id: false,
        year: { type: Number, required: true },
        register: { type: Number, required: true },
        renew: { type: Number, required: true },
        transfer: { type: Number, default: 0 }
    }],
    features: {
        dnsManagement: { type: Boolean, default: false },
        emailForwarding: { type: Boolean, default: false },
        idProtection: { type: Boolean, default: false }
    },
    autoRegistration: {
        enabled: { type: Boolean, default: false },
        provider: { type: String }
    },
    status: {
        type: String,
        default: 'active',
        enum: ['active', 'inactive', 'maintenance']
    }
}, {
    timestamps: true
});

export const TLDModel = mongoose.model<ITLD>('TLD', tldSchema);

import mongoose, { Schema } from 'mongoose';
import { IServerDocument, IServerModel } from './server.interface';

const nameserverSchema = new Schema({
    ns1: { type: String, required: true },
    ns1Ip: { type: String },
    ns2: { type: String, required: true },
    ns2Ip: { type: String },
    ns3: String,
    ns3Ip: String,
    ns4: String,
    ns4Ip: String,
    ns5: String,
    ns5Ip: String
}, { _id: false });

const moduleSchema = new Schema({
    type: { type: String, required: true, default: 'cpanel' },
    username: { type: String, required: true },
    password: { type: String, select: false }, // Sensitive
    apiToken: { type: String, select: false }, // Sensitive
    isSecure: { type: Boolean, default: true },
    port: { type: Number, default: 2087 },
    isPortOverride: { type: Boolean, default: false }
}, { _id: false });

const serverSchema = new Schema<IServerDocument, IServerModel>(
    {
        name: { type: String, required: true, trim: true },
        hostname: { type: String, required: true, unique: true, trim: true },
        ipAddress: { type: String, trim: true },
        assignedIpAddresses: { type: String, trim: true }, // Newline separated string
        monthlyCost: { type: Number, default: 0 },
        datacenter: { type: String, trim: true },
        maxAccounts: { type: Number, default: 200 },
        statusAddress: { type: String, trim: true },
        isEnabled: { type: Boolean, default: true },

        location: {
            type: String,
            enum: ['USA', 'Malaysia', 'Singapore', 'Bangladesh', 'Germany', 'Finland'],
            required: true,
            default: 'USA'
        },
        group: {
            type: String,
            enum: ['Web Hosting', 'BDIX Hosting', 'Turbo Hosting', 'Ecommerce Hosting', 'VPS', 'BDIX Vps'],
            required: true,
            default: 'Web Hosting'
        },

        nameservers: { type: nameserverSchema, required: true },
        module: { type: moduleSchema, required: true },

        accessControl: {
            type: String,
            enum: ['unrestricted', 'restricted'],
            default: 'unrestricted'
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

const Server = mongoose.model<IServerDocument, IServerModel>('Server', serverSchema);

export default Server;

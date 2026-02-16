import mongoose, { Schema } from 'mongoose';
import { IServiceDocument, IServiceModel, ServiceStatus, ServiceType, BillingCycle, AccessLevel } from './service.interface';

const hostingDetailsSchema = new Schema({
    username: String,
    password: { type: String, select: false }, // Only retrieve explicitly when needed
    serverIp: String,
    nameservers: [String],
    package: String,
    controlPanelUrl: String,
}, { _id: false });

const domainDetailsSchema = new Schema({
    domainName: { type: String, required: true },
    registrar: String,
    registrationDate: Date,
    expiryDate: Date,
    nameservers: [String],
    authCode: { type: String, select: false },
    autoRenew: { type: Boolean, default: true },
}, { _id: false });

const serverDetailsSchema = new Schema({
    ipAddress: String,
    rootPassword: { type: String, select: false },
    os: String,
    cpu: String,
    ram: String,
    storage: String,
}, { _id: false });

const emailDetailsSchema = new Schema({
    emailCount: Number,
    quota: String,
}, { _id: false });

const permissionSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    accessLevel: { type: String, enum: Object.values(AccessLevel), required: true },
}, { _id: false });

const serviceSchema = new Schema<IServiceDocument, IServiceModel>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
        },
        clientId: {
            type: Number,
            index: true,
        },
        type: {
            type: String,
            enum: Object.values(ServiceType),
            required: true,
            index: true,
        },
        productId: {
            type: String,
            required: true,
        },
        productName: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(ServiceStatus),
            default: ServiceStatus.PENDING,
            index: true,
        },
        billingCycle: {
            type: String,
            enum: Object.values(BillingCycle),
        },
        recurringAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            required: true,
            default: 'USD',
        },
        startDate: {
            type: Date,
            required: true,
            default: Date.now,
        },
        nextDueDate: {
            type: Date,
            required: true,
            index: true, // Useful for finding overdue services
        },
        lastPaymentDate: Date,

        serverLocation: String,

        permissions: [permissionSchema],

        // Details sub-documents
        hostingDetails: hostingDetailsSchema,
        domainDetails: domainDetailsSchema,
        serverDetails: serverDetailsSchema,
        emailDetails: emailDetailsSchema,
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Indexes for common queries
serviceSchema.index({ userId: 1, status: 1 });
serviceSchema.index({ 'domainDetails.domainName': 1 }); // Fast lookup by domain

const Service = mongoose.model<IServiceDocument, IServiceModel>('Service', serviceSchema);

export default Service;

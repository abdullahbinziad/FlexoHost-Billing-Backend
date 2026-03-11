import mongoose, { Schema, Document } from 'mongoose';

export enum ServiceAdminAction {
    SUSPEND = 'SUSPEND',
    UNSUSPEND = 'UNSUSPEND',
    TERMINATE = 'TERMINATE',
    CHANGE_PACKAGE = 'CHANGE_PACKAGE',
    RETRY_PROVISION = 'RETRY_PROVISION',
    UPDATE_NS = 'UPDATE_NS',
    TOGGLE_LOCK = 'TOGGLE_LOCK',
}

export interface IServiceAuditLog extends Document {
    actorUserId: mongoose.Types.ObjectId;
    clientId: mongoose.Types.ObjectId;
    serviceId: mongoose.Types.ObjectId;
    action: ServiceAdminAction;
    beforeSnapshot?: Record<string, any>;
    afterSnapshot?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    createdAt: Date;
}

const serviceAuditLogSchema = new Schema<IServiceAuditLog>(
    {
        actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service_WHMCS', required: true, index: true },
        action: { type: String, enum: Object.values(ServiceAdminAction), required: true },
        beforeSnapshot: { type: Schema.Types.Mixed },
        afterSnapshot: { type: Schema.Types.Mixed },
        ip: { type: String },
        userAgent: { type: String },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // Only need createdAt for audits
    }
);

const ServiceAuditLog = mongoose.model<IServiceAuditLog>('ServiceAuditLog', serviceAuditLogSchema);
export default ServiceAuditLog;

import mongoose, { Schema } from 'mongoose';
import {
    IClientAccessGrantDocument,
    IClientAccessGrantModel,
} from './client-access-grant.interface';

const grantSchema = new Schema<IClientAccessGrantDocument, IClientAccessGrantModel>(
    {
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        granteeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        scope: { type: String, enum: ['all', 'service_type', 'specific_services'], required: true },
        serviceType: { type: String, trim: true },
        serviceIds: [{ type: Schema.Types.ObjectId, ref: 'Service_WHMCS' }],
        permissions: [{ type: String, enum: ['view', 'manage'] }],
        expiresAt: { type: Date },
        allowInvoices: { type: Boolean, default: true },
        allowTickets: { type: Boolean, default: true },
        allowOrders: { type: Boolean, default: true },
    },
    { timestamps: true }
);

grantSchema.index({ clientId: 1, granteeUserId: 1 });
grantSchema.index({ granteeUserId: 1, expiresAt: 1 });

const ClientAccessGrant = mongoose.model<IClientAccessGrantDocument, IClientAccessGrantModel>(
    'ClientAccessGrant',
    grantSchema
);
export default ClientAccessGrant;

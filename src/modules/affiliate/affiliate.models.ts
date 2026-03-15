import mongoose, { Schema } from 'mongoose';
import { SUPPORTED_CURRENCIES } from '../../config/currency.config';
import {
    AffiliateCommissionStatus,
    AffiliatePayoutRequestStatus,
    AffiliateProfileStatus,
    AffiliateReferralSource,
    AffiliateReferralStatus,
    IAffiliateCommissionDocument,
    IAffiliatePayoutRequestDocument,
    IAffiliateProfileDocument,
    IAffiliateReferralDocument,
    IAffiliateSettingsDocument,
} from './affiliate.types';

const payoutDetailsSchema = new Schema(
    {
        method: { type: String, trim: true },
        accountName: { type: String, trim: true },
        accountNumber: { type: String, trim: true },
        provider: { type: String, trim: true },
        notes: { type: String, trim: true },
    },
    { _id: false }
);

const affiliateSettingsSchema = new Schema<IAffiliateSettingsDocument>(
    {
        defaultCommissionRate: { type: Number, required: true, min: 0, max: 100, default: 20 },
        defaultReferralDiscountRate: { type: Number, required: true, min: 0, max: 100, default: 5 },
        defaultPayoutThreshold: { type: Number, required: true, min: 0, default: 1000 },
        defaultPayoutThresholds: {
            type: Map,
            of: Number,
            default: () =>
                Object.fromEntries(SUPPORTED_CURRENCIES.map((currency) => [currency, 1000])),
        },
    },
    { timestamps: true }
);

const affiliateProfileSchema = new Schema<IAffiliateProfileDocument>(
    {
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, unique: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        referralCode: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
        status: {
            type: String,
            enum: Object.values(AffiliateProfileStatus),
            default: AffiliateProfileStatus.ACTIVE,
            index: true,
        },
        commissionRate: { type: Number, required: true, min: 0, max: 100, default: 10 },
        referralDiscountRate: { type: Number, required: true, min: 0, max: 100, default: 5 },
        payoutThreshold: { type: Number, required: true, min: 0, default: 1000 },
        preferredCurrency: { type: String, trim: true, uppercase: true, default: 'BDT' },
        payoutDetails: { type: payoutDetailsSchema, default: undefined },
        totals: {
            qualified: { type: Number, min: 0, default: 0 },
            approved: { type: Number, min: 0, default: 0 },
            payoutRequested: { type: Number, min: 0, default: 0 },
            credited: { type: Number, min: 0, default: 0 },
            paidOut: { type: Number, min: 0, default: 0 },
            reversed: { type: Number, min: 0, default: 0 },
        },
        referredClientsCount: { type: Number, min: 0, default: 0 },
        lastApprovedAt: { type: Date },
    },
    { timestamps: true }
);

const affiliateReferralSchema = new Schema<IAffiliateReferralDocument>(
    {
        affiliateProfileId: { type: Schema.Types.ObjectId, ref: 'AffiliateProfile', required: true, index: true },
        affiliateClientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        referredClientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, unique: true, index: true },
        firstOrderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
        firstInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
        referralCode: { type: String, required: true, trim: true, uppercase: true, index: true },
        source: {
            type: String,
            enum: Object.values(AffiliateReferralSource),
            required: true,
            default: AffiliateReferralSource.LINK,
        },
        status: {
            type: String,
            enum: Object.values(AffiliateReferralStatus),
            required: true,
            default: AffiliateReferralStatus.TRACKED,
        },
        qualifiedAt: { type: Date },
        convertedAt: { type: Date },
    },
    { timestamps: true }
);

affiliateReferralSchema.index({ affiliateProfileId: 1, createdAt: -1 });

const affiliateCommissionSchema = new Schema<IAffiliateCommissionDocument>(
    {
        affiliateProfileId: { type: Schema.Types.ObjectId, ref: 'AffiliateProfile', required: true, index: true },
        referralId: { type: Schema.Types.ObjectId, ref: 'AffiliateReferral', required: true, index: true },
        affiliateClientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        referredClientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
        paymentTransactionId: { type: Schema.Types.ObjectId, ref: 'PaymentTransaction', index: true },
        payoutRequestId: { type: Schema.Types.ObjectId, ref: 'AffiliatePayoutRequest', index: true },
        referralCode: { type: String, required: true, trim: true, uppercase: true, index: true },
        status: {
            type: String,
            enum: Object.values(AffiliateCommissionStatus),
            required: true,
            default: AffiliateCommissionStatus.QUALIFIED,
            index: true,
        },
        currency: { type: String, required: true, trim: true, uppercase: true },
        commissionRate: { type: Number, required: true, min: 0, max: 100 },
        referralDiscountRate: { type: Number, required: true, min: 0, max: 100, default: 0 },
        orderNetAmount: { type: Number, required: true, min: 0 },
        discountAmount: { type: Number, required: true, min: 0, default: 0 },
        commissionAmount: { type: Number, required: true, min: 0 },
        refundWindowDays: { type: Number, required: true, min: 0, default: 7 },
        qualifiedAt: { type: Date, required: true },
        availableAt: { type: Date, required: true, index: true },
        approvedAt: { type: Date },
        redeemedAt: { type: Date },
        reversedAt: { type: Date },
        reversalReason: { type: String, trim: true },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
);

affiliateCommissionSchema.index({ affiliateProfileId: 1, status: 1, createdAt: -1 });
affiliateCommissionSchema.index({ referredClientId: 1, createdAt: -1 });

const affiliatePayoutRequestSchema = new Schema<IAffiliatePayoutRequestDocument>(
    {
        affiliateProfileId: { type: Schema.Types.ObjectId, ref: 'AffiliateProfile', required: true, index: true },
        affiliateClientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        commissionIds: [{ type: Schema.Types.ObjectId, ref: 'AffiliateCommission', required: true }],
        amount: { type: Number, required: true, min: 0.01 },
        currency: { type: String, required: true, trim: true, uppercase: true },
        status: {
            type: String,
            enum: Object.values(AffiliatePayoutRequestStatus),
            required: true,
            default: AffiliatePayoutRequestStatus.PENDING,
            index: true,
        },
        payoutDetails: { type: payoutDetailsSchema, default: undefined },
        requestedAt: { type: Date, required: true, default: Date.now },
        reviewedAt: { type: Date },
        paidAt: { type: Date },
        reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewNotes: { type: String, trim: true },
    },
    { timestamps: true }
);

affiliatePayoutRequestSchema.index({ affiliateProfileId: 1, createdAt: -1 });

export const AffiliateProfile = mongoose.model<IAffiliateProfileDocument>('AffiliateProfile', affiliateProfileSchema);
export const AffiliateReferral = mongoose.model<IAffiliateReferralDocument>('AffiliateReferral', affiliateReferralSchema);
export const AffiliateCommission = mongoose.model<IAffiliateCommissionDocument>('AffiliateCommission', affiliateCommissionSchema);
export const AffiliateSettings = mongoose.model<IAffiliateSettingsDocument>('AffiliateSettings', affiliateSettingsSchema);
export const AffiliatePayoutRequest = mongoose.model<IAffiliatePayoutRequestDocument>(
    'AffiliatePayoutRequest',
    affiliatePayoutRequestSchema
);

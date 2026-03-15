import { Document, Types } from 'mongoose';

export enum AffiliateProfileStatus {
    ACTIVE = 'active',
    PAUSED = 'paused',
}

export enum AffiliateReferralStatus {
    TRACKED = 'tracked',
    QUALIFIED = 'qualified',
    CONVERTED = 'converted',
}

export enum AffiliateReferralSource {
    LINK = 'link',
    CODE = 'code',
    COUPON = 'coupon',
}

export enum AffiliateCommissionStatus {
    QUALIFIED = 'qualified',
    APPROVED = 'approved',
    PAYOUT_REQUESTED = 'payout_requested',
    CREDITED = 'credited',
    PAID_OUT = 'paid_out',
    REVERSED = 'reversed',
}

export enum AffiliatePayoutRequestStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    PAID = 'paid',
}

export interface IAffiliateProfile {
    clientId: Types.ObjectId;
    userId: Types.ObjectId;
    referralCode: string;
    status: AffiliateProfileStatus;
    commissionRate: number;
    referralDiscountRate: number;
    payoutThreshold: number;
    preferredCurrency: string;
    payoutDetails?: {
        method?: string;
        accountName?: string;
        accountNumber?: string;
        provider?: string;
        notes?: string;
    };
    totals: {
        qualified: number;
        approved: number;
        payoutRequested: number;
        credited: number;
        paidOut: number;
        reversed: number;
    };
    referredClientsCount: number;
    lastApprovedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAffiliateProfileDocument extends IAffiliateProfile, Document {}

export interface IAffiliateSettings {
    defaultCommissionRate: number;
    defaultReferralDiscountRate: number;
    defaultPayoutThreshold?: number;
    defaultPayoutThresholds: Record<string, number>;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAffiliateSettingsDocument extends IAffiliateSettings, Document {}

export interface IAffiliateReferral {
    affiliateProfileId: Types.ObjectId;
    affiliateClientId: Types.ObjectId;
    referredClientId: Types.ObjectId;
    firstOrderId?: Types.ObjectId;
    firstInvoiceId?: Types.ObjectId;
    referralCode: string;
    source: AffiliateReferralSource;
    status: AffiliateReferralStatus;
    qualifiedAt?: Date;
    convertedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAffiliateReferralDocument extends IAffiliateReferral, Document {}

export interface IAffiliateCommission {
    affiliateProfileId: Types.ObjectId;
    referralId: Types.ObjectId;
    affiliateClientId: Types.ObjectId;
    referredClientId: Types.ObjectId;
    orderId?: Types.ObjectId;
    invoiceId: Types.ObjectId;
    paymentTransactionId?: Types.ObjectId;
    payoutRequestId?: Types.ObjectId;
    referralCode: string;
    status: AffiliateCommissionStatus;
    currency: string;
    commissionRate: number;
    referralDiscountRate: number;
    orderNetAmount: number;
    discountAmount: number;
    commissionAmount: number;
    refundWindowDays: number;
    qualifiedAt: Date;
    availableAt: Date;
    approvedAt?: Date;
    redeemedAt?: Date;
    reversedAt?: Date;
    reversalReason?: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAffiliateCommissionDocument extends IAffiliateCommission, Document {}

export interface IAffiliatePayoutRequest {
    affiliateProfileId: Types.ObjectId;
    affiliateClientId: Types.ObjectId;
    commissionIds: Types.ObjectId[];
    amount: number;
    currency: string;
    status: AffiliatePayoutRequestStatus;
    payoutDetails?: {
        method?: string;
        accountName?: string;
        accountNumber?: string;
        provider?: string;
        notes?: string;
    };
    requestedAt: Date;
    reviewedAt?: Date;
    paidAt?: Date;
    reviewedByUserId?: Types.ObjectId;
    reviewNotes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAffiliatePayoutRequestDocument extends IAffiliatePayoutRequest, Document {}

export interface AffiliateCurrencyTotals {
    qualified: number;
    approved: number;
    payoutRequested: number;
    credited: number;
    paidOut: number;
    reversed: number;
    totalEarned: number;
}

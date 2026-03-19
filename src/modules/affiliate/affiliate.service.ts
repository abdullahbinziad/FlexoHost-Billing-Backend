import mongoose from 'mongoose';
import ApiError from '../../utils/apiError';
import config from '../../config';
import Client from '../client/client.model';
import Invoice from '../invoice/invoice.model';
import Order from '../order/order.model';
import PaymentTransaction from '../transaction/transaction.model';
import { auditLogSafe } from '../activity-log/activity-log.service';
import {
    AffiliateCommission,
    AffiliatePayoutRequest,
    AffiliateProfile,
    AffiliateReferral,
    AffiliateSettings,
} from './affiliate.models';
import {
    AffiliateCommissionStatus,
    AffiliateCurrencyTotals,
    AffiliatePayoutRequestStatus,
    AffiliateProfileStatus,
    AffiliateReferralSource,
    AffiliateReferralStatus,
} from './affiliate.types';

const DEFAULT_COMMISSION_RATE = 20;
const DEFAULT_REFERRAL_DISCOUNT_RATE = 5;
const DEFAULT_PAYOUT_THRESHOLD = 1000;
const DEFAULT_REFUND_WINDOW_DAYS = 7;

function round2(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeCode(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

class AffiliateService {
    private async getAffiliateSettings() {
        let settings = await AffiliateSettings.findOne().exec();
        if (!settings) {
            settings = await AffiliateSettings.create({
                defaultCommissionRate: DEFAULT_COMMISSION_RATE,
                defaultReferralDiscountRate: DEFAULT_REFERRAL_DISCOUNT_RATE,
                defaultPayoutThreshold: DEFAULT_PAYOUT_THRESHOLD,
            });
        }
        return settings;
    }

    private async getDefaultCommissionRate() {
        const settings = await this.getAffiliateSettings();
        return settings.defaultCommissionRate ?? DEFAULT_COMMISSION_RATE;
    }

    private async getDefaultReferralDiscountRate() {
        const settings = await this.getAffiliateSettings();
        return settings.defaultReferralDiscountRate ?? DEFAULT_REFERRAL_DISCOUNT_RATE;
    }

    private async getDefaultPayoutThreshold() {
        const settings = await this.getAffiliateSettings();
        return settings.defaultPayoutThreshold ?? DEFAULT_PAYOUT_THRESHOLD;
    }

    private buildReferralLink(referralCode: string): string {
        const baseUrl = config.frontendUrl;
        return `${baseUrl}/checkout?ref=${encodeURIComponent(referralCode)}`;
    }

    private async generateUniqueReferralCode(client: any): Promise<string> {
        const base = `${client.firstName || 'CLIENT'}${client.clientId || ''}`
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 10) || 'AFFILIATE';

        let candidate = base;
        let counter = 1;
        while (await AffiliateProfile.exists({ referralCode: candidate })) {
            candidate = `${base}${counter}`;
            counter += 1;
        }
        return candidate;
    }

    private async getClientByUserId(userId: string) {
        const client = await Client.findOne({ user: userId });
        if (!client) {
            throw new ApiError(404, 'Client not found');
        }
        return client;
    }

    private async syncProfileStats(profileId: string | mongoose.Types.ObjectId): Promise<void> {
        const objectId = typeof profileId === 'string' ? new mongoose.Types.ObjectId(profileId) : profileId;
        const [totals] = await AffiliateCommission.aggregate([
            { $match: { affiliateProfileId: objectId } },
            {
                $group: {
                    _id: null,
                    qualified: {
                        $sum: {
                            $cond: [{ $eq: ['$status', AffiliateCommissionStatus.QUALIFIED] }, '$commissionAmount', 0],
                        },
                    },
                    approved: {
                        $sum: {
                            $cond: [{ $eq: ['$status', AffiliateCommissionStatus.APPROVED] }, '$commissionAmount', 0],
                        },
                    },
                    payoutRequested: {
                        $sum: {
                            $cond: [{ $eq: ['$status', AffiliateCommissionStatus.PAYOUT_REQUESTED] }, '$commissionAmount', 0],
                        },
                    },
                    credited: {
                        $sum: {
                            $cond: [{ $eq: ['$status', AffiliateCommissionStatus.CREDITED] }, '$commissionAmount', 0],
                        },
                    },
                    paidOut: {
                        $sum: {
                            $cond: [{ $eq: ['$status', AffiliateCommissionStatus.PAID_OUT] }, '$commissionAmount', 0],
                        },
                    },
                    reversed: {
                        $sum: {
                            $cond: [{ $eq: ['$status', AffiliateCommissionStatus.REVERSED] }, '$commissionAmount', 0],
                        },
                    },
                    lastApprovedAt: { $max: '$approvedAt' },
                },
            },
        ]);

        const referredClientsCount = await AffiliateReferral.countDocuments({ affiliateProfileId: objectId });
        await AffiliateProfile.findByIdAndUpdate(objectId, {
            $set: {
                totals: {
                    qualified: round2(totals?.qualified || 0),
                    approved: round2(totals?.approved || 0),
                    payoutRequested: round2(totals?.payoutRequested || 0),
                    credited: round2(totals?.credited || 0),
                    paidOut: round2(totals?.paidOut || 0),
                    reversed: round2(totals?.reversed || 0),
                },
                referredClientsCount,
                lastApprovedAt: totals?.lastApprovedAt || undefined,
            },
        }).exec();
    }

    private async determineDashboardCurrency(profileId: mongoose.Types.ObjectId, preferredCurrency?: string): Promise<string> {
        if (preferredCurrency) return preferredCurrency;
        const latest = await AffiliateCommission.findOne({ affiliateProfileId: profileId }).sort({ createdAt: -1 }).select('currency').lean();
        return latest?.currency || 'BDT';
    }

    private buildCurrencyTotals(commissions: any[]): Record<string, AffiliateCurrencyTotals> {
        return commissions.reduce<Record<string, AffiliateCurrencyTotals>>((acc, commission) => {
            const currency = commission.currency || 'BDT';
            acc[currency] = acc[currency] || {
                qualified: 0,
                approved: 0,
                payoutRequested: 0,
                credited: 0,
                paidOut: 0,
                reversed: 0,
                totalEarned: 0,
            };
            const amount = Number(commission.commissionAmount) || 0;
            acc[currency].totalEarned = round2(acc[currency].totalEarned + amount);
            switch (commission.status) {
                case AffiliateCommissionStatus.QUALIFIED:
                    acc[currency].qualified = round2(acc[currency].qualified + amount);
                    break;
                case AffiliateCommissionStatus.APPROVED:
                    acc[currency].approved = round2(acc[currency].approved + amount);
                    break;
                case AffiliateCommissionStatus.PAYOUT_REQUESTED:
                    acc[currency].payoutRequested = round2(acc[currency].payoutRequested + amount);
                    break;
                case AffiliateCommissionStatus.CREDITED:
                    acc[currency].credited = round2(acc[currency].credited + amount);
                    break;
                case AffiliateCommissionStatus.PAID_OUT:
                    acc[currency].paidOut = round2(acc[currency].paidOut + amount);
                    break;
                case AffiliateCommissionStatus.REVERSED:
                    acc[currency].reversed = round2(acc[currency].reversed + amount);
                    break;
                default:
                    break;
            }
            return acc;
        }, {});
    }

    private async collectApprovedCommissions(profileId: mongoose.Types.ObjectId, currency: string, amount?: number) {
        const commissions = await AffiliateCommission.find({
            affiliateProfileId: profileId,
            currency,
            status: AffiliateCommissionStatus.APPROVED,
        })
            .sort({ availableAt: 1, createdAt: 1 })
            .exec();

        if (amount === undefined) {
            return {
                commissions,
                total: round2(commissions.reduce((sum, item) => sum + (item.commissionAmount || 0), 0)),
            };
        }

        const selected: typeof commissions = [];
        let running = 0;
        for (const commission of commissions) {
            if (running >= amount) break;
            selected.push(commission);
            running = round2(running + (commission.commissionAmount || 0));
        }
        return { commissions: selected, total: running };
    }

    private async allocateApprovedAmount(params: {
        profileId: mongoose.Types.ObjectId;
        currency: string;
        amount: number;
        status: AffiliateCommissionStatus.CREDITED | AffiliateCommissionStatus.PAYOUT_REQUESTED;
        notes: string;
        payoutRequestId?: mongoose.Types.ObjectId;
    }) {
        const approved = await AffiliateCommission.find({
            affiliateProfileId: params.profileId,
            currency: params.currency,
            status: AffiliateCommissionStatus.APPROVED,
        })
            .sort({ availableAt: 1, createdAt: 1 })
            .exec();

        let remaining = round2(params.amount);
        const allocatedIds: mongoose.Types.ObjectId[] = [];
        const now = new Date();

        for (const commission of approved) {
            if (remaining <= 0) break;
            const available = round2(commission.commissionAmount || 0);
            if (available <= 0) continue;

            if (remaining >= available) {
                commission.status = params.status;
                commission.notes = params.notes;
                commission.redeemedAt = now;
                if (params.payoutRequestId) {
                    commission.payoutRequestId = params.payoutRequestId;
                }
                await commission.save();
                allocatedIds.push(commission._id as mongoose.Types.ObjectId);
                remaining = round2(remaining - available);
                continue;
            }

            const ratio = remaining / available;
            const originalData = commission.toObject();
            const allocatedCommissionAmount = round2(remaining);
            const allocatedOrderNetAmount = round2((commission.orderNetAmount || 0) * ratio);
            const allocatedDiscountAmount = round2((commission.discountAmount || 0) * ratio);

            commission.commissionAmount = round2(available - allocatedCommissionAmount);
            commission.orderNetAmount = round2((commission.orderNetAmount || 0) - allocatedOrderNetAmount);
            commission.discountAmount = round2((commission.discountAmount || 0) - allocatedDiscountAmount);
            await commission.save();

            const splitCommission = await AffiliateCommission.create({
                ...originalData,
                _id: undefined,
                status: params.status,
                payoutRequestId: params.payoutRequestId,
                notes: params.notes,
                redeemedAt: now,
                commissionAmount: allocatedCommissionAmount,
                orderNetAmount: allocatedOrderNetAmount,
                discountAmount: allocatedDiscountAmount,
            });
            allocatedIds.push(splitCommission._id as mongoose.Types.ObjectId);
            remaining = 0;
        }

        if (remaining > 0) {
            throw new ApiError(400, 'Insufficient approved affiliate balance');
        }

        return allocatedIds;
    }

    private async ensureEnrollmentForClient(
        client: any,
        actorUserId?: string,
        actorType: 'user' | 'system' = 'user'
    ) {
        let profile = await AffiliateProfile.findOne({ clientId: client._id });

        if (!profile) {
            const [defaultCommissionRate, defaultReferralDiscountRate, defaultPayoutThreshold] = await Promise.all([
                this.getDefaultCommissionRate(),
                this.getDefaultReferralDiscountRate(),
                this.getDefaultPayoutThreshold(),
            ]);

            profile = await AffiliateProfile.create({
                clientId: client._id,
                userId: client.user,
                referralCode: await this.generateUniqueReferralCode(client),
                status: AffiliateProfileStatus.ACTIVE,
                commissionRate: defaultCommissionRate,
                referralDiscountRate: defaultReferralDiscountRate,
                payoutThreshold: defaultPayoutThreshold,
                preferredCurrency: client.accountCreditCurrency || 'BDT',
            });

            auditLogSafe({
                message: `Affiliate profile created for client ${client.clientId}`,
                type: 'affiliate_joined' as any,
                category: 'affiliate' as any,
                actorType,
                actorId: (actorUserId || client.user) as any,
                clientId: client._id as any,
                source: 'manual',
                status: 'success',
                meta: { referralCode: profile.referralCode } as Record<string, unknown>,
            });
        }

        return {
            profile,
            referralLink: this.buildReferralLink(profile.referralCode),
        };
    }

    async ensureEnrollmentForUser(userId: string) {
        const client = await this.getClientByUserId(userId);
        return this.ensureEnrollmentForClient(client, userId, 'user');
    }

    async validateReferralCodeDiscount(params: {
        code: string;
        subtotal: number;
        clientId?: string;
    }): Promise<{
        valid: boolean;
        error?: string;
        code?: string;
        name?: string;
        discountAmount?: number;
        affiliateProfile?: any;
        source?: 'affiliate';
    }> {
        const code = normalizeCode(params.code);
        if (!code) {
            return { valid: false, error: 'Referral code is required' };
        }

        const profile = await AffiliateProfile.findOne({
            referralCode: code,
            status: AffiliateProfileStatus.ACTIVE,
        }).lean();

        if (!profile) {
            return { valid: false, error: 'Invalid or expired coupon code' };
        }

        if (params.clientId && profile.clientId.toString() === params.clientId) {
            return { valid: false, error: 'You cannot use your own referral code' };
        }

        const discountAmount = round2((Number(params.subtotal) || 0) * ((profile.referralDiscountRate || 0) / 100));
        if (discountAmount <= 0) {
            return { valid: false, error: 'No discount applicable for this order' };
        }

        return {
            valid: true,
            code: profile.referralCode,
            name: `Affiliate referral ${profile.referralCode}`,
            discountAmount,
            affiliateProfile: profile,
            source: 'affiliate',
        };
    }

    async trackReferralAttribution(params: {
        buyerClientId: string;
        orderId: string;
        invoiceId?: string;
        referralCode?: string;
        source?: AffiliateReferralSource;
    }) {
        const referralCode = normalizeCode(params.referralCode);
        if (!referralCode) return null;

        const profile = await AffiliateProfile.findOne({
            referralCode,
            status: AffiliateProfileStatus.ACTIVE,
        }).exec();
        if (!profile) return null;

        if (profile.clientId.toString() === params.buyerClientId) {
            return null;
        }

        const existing = await AffiliateReferral.findOne({
            referredClientId: new mongoose.Types.ObjectId(params.buyerClientId),
        }).exec();

        if (existing) {
            if (!existing.firstOrderId) existing.firstOrderId = new mongoose.Types.ObjectId(params.orderId);
            if (!existing.firstInvoiceId && params.invoiceId) existing.firstInvoiceId = new mongoose.Types.ObjectId(params.invoiceId);
            await existing.save();
            return existing;
        }

        const referral = await AffiliateReferral.create({
            affiliateProfileId: profile._id,
            affiliateClientId: profile.clientId,
            referredClientId: new mongoose.Types.ObjectId(params.buyerClientId),
            firstOrderId: new mongoose.Types.ObjectId(params.orderId),
            firstInvoiceId: params.invoiceId ? new mongoose.Types.ObjectId(params.invoiceId) : undefined,
            referralCode,
            source: params.source || AffiliateReferralSource.LINK,
            status: AffiliateReferralStatus.TRACKED,
        });

        await this.syncProfileStats(profile._id);

        auditLogSafe({
            message: `Referral tracked for affiliate ${referralCode}`,
            type: 'affiliate_referral_tracked' as any,
            category: 'affiliate' as any,
            actorType: 'system',
            source: 'system',
            status: 'success',
            clientId: profile.clientId as any,
            orderId: params.orderId as any,
            invoiceId: params.invoiceId as any,
            meta: {
                referredClientId: params.buyerClientId,
                source: referral.source,
            } as Record<string, unknown>,
        });

        return referral;
    }

    async approveEligibleCommissions() {
        const now = new Date();
        const commissions = await AffiliateCommission.find({
            status: AffiliateCommissionStatus.QUALIFIED,
            availableAt: { $lte: now },
        }).exec();

        if (!commissions.length) {
            return 0;
        }

        const affectedProfileIds = new Set<string>();
        for (const commission of commissions) {
            commission.status = AffiliateCommissionStatus.APPROVED;
            commission.approvedAt = now;
            await commission.save();
            affectedProfileIds.add(commission.affiliateProfileId.toString());
        }

        await Promise.all(Array.from(affectedProfileIds).map((id) => this.syncProfileStats(id)));
        return commissions.length;
    }

    async processPaidInvoice(invoiceId: string, paymentTransactionId?: string) {
        await this.approveEligibleCommissions();

        const existing = await AffiliateCommission.findOne({ invoiceId }).exec();
        if (existing) {
            return existing;
        }

        const invoice = await Invoice.findById(invoiceId).lean();
        if (!invoice?.orderId || !invoice.clientId) {
            return null;
        }

        const order = await Order.findById(invoice.orderId).lean();
        if (!order) {
            return null;
        }

        const referral = await AffiliateReferral.findOne({
            referredClientId: invoice.clientId,
        }).exec();
        if (!referral || (referral.firstOrderId && referral.firstOrderId.toString() !== String(order._id))) {
            return null;
        }

        const priorCommission = await AffiliateCommission.findOne({
            referredClientId: invoice.clientId,
        })
            .sort({ createdAt: 1 })
            .lean();
        if (priorCommission) {
            return null;
        }

        const profile = await AffiliateProfile.findById(referral.affiliateProfileId).exec();
        if (!profile || profile.status !== AffiliateProfileStatus.ACTIVE) {
            return null;
        }

        const orderNetAmount = round2(Number(invoice.total) || Number(order.total) || 0);
        if (orderNetAmount <= 0) {
            return null;
        }

        const qualifiedAt = new Date();
        const commission = await AffiliateCommission.create({
            affiliateProfileId: profile._id,
            referralId: referral._id,
            affiliateClientId: profile.clientId,
            referredClientId: invoice.clientId,
            orderId: order._id,
            invoiceId: invoice._id,
            paymentTransactionId: paymentTransactionId ? new mongoose.Types.ObjectId(paymentTransactionId) : undefined,
            referralCode: profile.referralCode,
            status: AffiliateCommissionStatus.QUALIFIED,
            currency: invoice.currency || profile.preferredCurrency || 'BDT',
            commissionRate: profile.commissionRate ?? DEFAULT_COMMISSION_RATE,
            referralDiscountRate: profile.referralDiscountRate ?? 0,
            orderNetAmount,
            discountAmount: round2(Number(order.discountTotal) || 0),
            commissionAmount: round2(orderNetAmount * ((profile.commissionRate ?? DEFAULT_COMMISSION_RATE) / 100)),
            refundWindowDays: DEFAULT_REFUND_WINDOW_DAYS,
            qualifiedAt,
            availableAt: addDays(qualifiedAt, DEFAULT_REFUND_WINDOW_DAYS),
        });

        referral.status = AffiliateReferralStatus.QUALIFIED;
        referral.qualifiedAt = qualifiedAt;
        referral.convertedAt = qualifiedAt;
        if (!referral.firstInvoiceId) referral.firstInvoiceId = invoice._id as any;
        await referral.save();

        await this.syncProfileStats(profile._id);

        auditLogSafe({
            message: `Affiliate commission created for invoice ${(invoice as any).invoiceNumber || invoiceId}`,
            type: 'affiliate_commission_created' as any,
            category: 'affiliate' as any,
            actorType: 'system',
            source: 'system',
            status: 'success',
            clientId: profile.clientId as any,
            invoiceId: invoice._id as any,
            orderId: order._id as any,
            meta: {
                commissionAmount: commission.commissionAmount,
                currency: commission.currency,
                referralCode: commission.referralCode,
            } as Record<string, unknown>,
        });

        return commission;
    }

    async reverseCommissionsForInvoice(invoiceId: string, reason = 'Invoice refunded or reverted') {
        const commissions = await AffiliateCommission.find({
            invoiceId: new mongoose.Types.ObjectId(invoiceId),
            status: { $ne: AffiliateCommissionStatus.REVERSED },
        }).exec();

        if (!commissions.length) {
            return 0;
        }

        const affectedProfiles = new Set<string>();
        for (const commission of commissions) {
            if (commission.status === AffiliateCommissionStatus.CREDITED) {
                const client = await Client.findById(commission.affiliateClientId).exec();
                if (client && client.accountCreditCurrency === commission.currency) {
                    client.accountCreditBalance = Math.max(
                        0,
                        round2((client.accountCreditBalance || 0) - (commission.commissionAmount || 0))
                    );
                    await client.save();
                }
            }

            commission.status = AffiliateCommissionStatus.REVERSED;
            commission.reversedAt = new Date();
            commission.reversalReason = reason;
            await commission.save();
            affectedProfiles.add(commission.affiliateProfileId.toString());

            await AffiliateReferral.findByIdAndUpdate(commission.referralId, {
                $set: { status: AffiliateReferralStatus.TRACKED },
                $unset: { qualifiedAt: 1, convertedAt: 1 },
            }).exec();

            auditLogSafe({
                message: `Affiliate commission reversed for invoice ${invoiceId}`,
                type: 'affiliate_commission_reversed' as any,
                category: 'affiliate' as any,
                actorType: 'system',
                source: 'system',
                status: 'success',
                clientId: commission.affiliateClientId as any,
                invoiceId: commission.invoiceId as any,
                orderId: commission.orderId as any,
                meta: { reason } as Record<string, unknown>,
            });
        }

        await Promise.all(Array.from(affectedProfiles).map((id) => this.syncProfileStats(id)));
        return commissions.length;
    }

    async getClientDashboard(userId: string) {
        await this.approveEligibleCommissions();

        const client = await this.getClientByUserId(userId);
        const { profile } = await this.ensureEnrollmentForClient(client, userId, 'user');
        const profileData = profile.toObject();

        const [referrals, commissions, payoutRequests] = await Promise.all([
            AffiliateReferral.find({ affiliateProfileId: profile._id })
                .populate('referredClientId', 'clientId firstName lastName contactEmail')
                .sort({ createdAt: -1 })
                .limit(100)
                .lean(),
            AffiliateCommission.find({ affiliateProfileId: profile._id })
                .sort({ createdAt: -1 })
                .limit(200)
                .lean(),
            AffiliatePayoutRequest.find({ affiliateProfileId: profile._id })
                .sort({ createdAt: -1 })
                .limit(100)
                .lean(),
        ]);

        const preferredCurrency = await this.determineDashboardCurrency(profile._id as any, profile.preferredCurrency);
        return {
            enrolled: true,
            profile: {
                ...profileData,
                preferredCurrency,
                referralLink: this.buildReferralLink(profileData.referralCode),
            },
            summaryByCurrency: this.buildCurrencyTotals(commissions),
            referrals,
            commissions,
            payoutRequests,
            clientCreditBalance: client.accountCreditBalance || 0,
            clientCreditCurrency: client.accountCreditCurrency || preferredCurrency || 'BDT',
        };
    }

    async getAdminClientAffiliate(clientId: string) {
        await this.approveEligibleCommissions();

        const client = await Client.findById(clientId)
            .populate('user', 'email role verified active createdAt')
            .lean();

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        const profile = await AffiliateProfile.findOne({ clientId: client._id }).lean();

        if (!profile) {
            return {
                enrolled: false,
                client,
            };
        }

        const [referrals, commissions, payoutRequests] = await Promise.all([
            AffiliateReferral.find({ affiliateProfileId: profile._id })
                .populate('referredClientId', 'clientId firstName lastName contactEmail')
                .sort({ createdAt: -1 })
                .limit(100)
                .lean(),
            AffiliateCommission.find({ affiliateProfileId: profile._id })
                .sort({ createdAt: -1 })
                .limit(200)
                .lean(),
            AffiliatePayoutRequest.find({ affiliateProfileId: profile._id })
                .populate('affiliateClientId', 'clientId firstName lastName contactEmail')
                .populate('affiliateProfileId', 'referralCode')
                .sort({ createdAt: -1 })
                .limit(100)
                .lean(),
        ]);

        const preferredCurrency = await this.determineDashboardCurrency(profile._id as any, profile.preferredCurrency);

        return {
            enrolled: true,
            client,
            profile: {
                ...profile,
                preferredCurrency,
                referralLink: this.buildReferralLink(profile.referralCode),
            },
            summaryByCurrency: this.buildCurrencyTotals(commissions),
            referrals,
            commissions,
            payoutRequests,
            clientCreditBalance: client.accountCreditBalance || 0,
            clientCreditCurrency: client.accountCreditCurrency || preferredCurrency || 'BDT',
        };
    }

    async enrollClientByAdmin(clientId: string, actorUserId: string) {
        const client = await Client.findById(clientId).exec();
        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        return this.ensureEnrollmentForClient(client, actorUserId, 'user');
    }

    async updateMyReferralCode(userId: string, payload: { referralCode: string }) {
        const client = await this.getClientByUserId(userId);
        const { profile } = await this.ensureEnrollmentForClient(client, userId, 'user');
        const referralCode = normalizeCode(payload.referralCode);

        if (!/^[A-Z0-9]{4,20}$/.test(referralCode)) {
            throw new ApiError(400, 'Referral code must be 4-20 letters or numbers');
        }

        const existing = await AffiliateProfile.findOne({
            referralCode,
            _id: { $ne: profile._id },
        })
            .select('_id')
            .lean();

        if (existing) {
            throw new ApiError(400, 'Referral code is already in use');
        }

        profile.referralCode = referralCode;
        await profile.save();

        auditLogSafe({
            message: `Affiliate referral code updated for ${profile.referralCode}`,
            type: 'affiliate_settings_updated' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: userId as any,
            source: 'manual',
            status: 'success',
            clientId: client._id as any,
            meta: { referralCode } as Record<string, unknown>,
        });

        return {
            profile: profile.toObject(),
            referralLink: this.buildReferralLink(profile.referralCode),
        };
    }

    async regenerateMyReferralCode(userId: string) {
        const client = await this.getClientByUserId(userId);
        const { profile } = await this.ensureEnrollmentForClient(client, userId, 'user');

        profile.referralCode = await this.generateUniqueReferralCode(client);
        await profile.save();

        auditLogSafe({
            message: `Affiliate referral code regenerated for client ${client.clientId}`,
            type: 'affiliate_settings_updated' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: userId as any,
            source: 'manual',
            status: 'success',
            clientId: client._id as any,
            meta: { referralCode: profile.referralCode } as Record<string, unknown>,
        });

        return {
            profile: profile.toObject(),
            referralLink: this.buildReferralLink(profile.referralCode),
        };
    }

    async updateClientAffiliateReferralCode(clientId: string, payload: { referralCode: string }, actorUserId: string) {
        const client = await Client.findById(clientId).exec();
        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        const profile = await AffiliateProfile.findOne({ clientId: client._id }).exec();
        if (!profile) {
            throw new ApiError(404, 'Affiliate profile not found for this client');
        }

        const referralCode = normalizeCode(payload.referralCode);

        if (!/^[A-Z0-9]{4,20}$/.test(referralCode)) {
            throw new ApiError(400, 'Referral code must be 4-20 letters or numbers');
        }

        const existing = await AffiliateProfile.findOne({
            referralCode,
            _id: { $ne: profile._id },
        })
            .select('_id')
            .lean();

        if (existing) {
            throw new ApiError(400, 'Referral code is already in use');
        }

        profile.referralCode = referralCode;
        await profile.save();

        auditLogSafe({
            message: `Admin updated affiliate referral code for client ${client.clientId}`,
            type: 'affiliate_settings_updated' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: actorUserId as any,
            source: 'manual',
            status: 'success',
            clientId: client._id as any,
            meta: { referralCode } as Record<string, unknown>,
        });

        return {
            profile: profile.toObject(),
            referralLink: this.buildReferralLink(profile.referralCode),
        };
    }

    async regenerateClientAffiliateReferralCode(clientId: string, actorUserId: string) {
        const client = await Client.findById(clientId).exec();
        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        const profile = await AffiliateProfile.findOne({ clientId: client._id }).exec();
        if (!profile) {
            throw new ApiError(404, 'Affiliate profile not found for this client');
        }

        profile.referralCode = await this.generateUniqueReferralCode(client);
        await profile.save();

        auditLogSafe({
            message: `Admin regenerated affiliate referral code for client ${client.clientId}`,
            type: 'affiliate_settings_updated' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: actorUserId as any,
            source: 'manual',
            status: 'success',
            clientId: client._id as any,
            meta: { referralCode: profile.referralCode } as Record<string, unknown>,
        });

        return {
            profile: profile.toObject(),
            referralLink: this.buildReferralLink(profile.referralCode),
        };
    }

    async redeemToCreditForUser(userId: string, payload: { amount: number; currency?: string }) {
        await this.approveEligibleCommissions();

        const client = await this.getClientByUserId(userId);
        const profile = await AffiliateProfile.findOne({ clientId: client._id }).exec();
        if (!profile) {
            throw new ApiError(404, 'Affiliate profile not found');
        }

        const currency = (payload.currency || client.accountCreditCurrency || profile.preferredCurrency || 'BDT').toUpperCase();
        const requestedAmount = round2(Number(payload.amount) || 0);
        if (requestedAmount <= 0) {
            throw new ApiError(400, 'Amount must be greater than zero');
        }

        if (client.accountCreditCurrency && client.accountCreditCurrency !== currency) {
            throw new ApiError(400, `Account credit is currently maintained in ${client.accountCreditCurrency}`);
        }

        const { total } = await this.collectApprovedCommissions(profile._id as any, currency, requestedAmount);
        if (total < requestedAmount) {
            throw new ApiError(400, 'Insufficient approved affiliate balance');
        }

        await this.allocateApprovedAmount({
            profileId: profile._id as mongoose.Types.ObjectId,
            currency,
            amount: requestedAmount,
            status: AffiliateCommissionStatus.CREDITED,
            notes: 'Redeemed to account credit',
        });

        client.accountCreditBalance = round2((client.accountCreditBalance || 0) + requestedAmount);
        client.accountCreditCurrency = currency;
        await client.save();

        await this.syncProfileStats(profile._id);

        auditLogSafe({
            message: `Affiliate credit redeemed for client ${client.clientId}`,
            type: 'affiliate_credit_redeemed' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: client.user as any,
            source: 'manual',
            status: 'success',
            clientId: client._id as any,
            meta: {
                amount: requestedAmount,
                currency,
            } as Record<string, unknown>,
        });

        return {
            redeemedAmount: requestedAmount,
            currency,
            accountCreditBalance: client.accountCreditBalance,
            accountCreditCurrency: client.accountCreditCurrency,
        };
    }

    async createPayoutRequestForUser(
        userId: string,
        payload: {
            amount: number;
            currency?: string;
            payoutDetails?: {
                method?: string;
                accountName?: string;
                accountNumber?: string;
                provider?: string;
                notes?: string;
            };
        }
    ) {
        await this.approveEligibleCommissions();

        const client = await this.getClientByUserId(userId);
        const profile = await AffiliateProfile.findOne({ clientId: client._id }).exec();
        if (!profile) {
            throw new ApiError(404, 'Affiliate profile not found');
        }

        const currency = (payload.currency || profile.preferredCurrency || 'BDT').toUpperCase();
        const requestedAmount = round2(Number(payload.amount) || 0);
        if (requestedAmount <= 0) {
            throw new ApiError(400, 'Amount must be greater than zero');
        }
        const minimumPayoutThreshold = profile.payoutThreshold ?? DEFAULT_PAYOUT_THRESHOLD;
        if (requestedAmount < minimumPayoutThreshold) {
            throw new ApiError(400, `Minimum payout request is ${minimumPayoutThreshold} ${currency}`);
        }

        const existingPending = await AffiliatePayoutRequest.findOne({
            affiliateProfileId: profile._id,
            status: { $in: [AffiliatePayoutRequestStatus.PENDING, AffiliatePayoutRequestStatus.APPROVED] },
            currency,
        }).lean();
        if (existingPending) {
            throw new ApiError(400, 'You already have a pending payout request in this currency');
        }

        const { total } = await this.collectApprovedCommissions(profile._id as any, currency, requestedAmount);
        if (total < requestedAmount) {
            throw new ApiError(400, 'Insufficient approved affiliate balance');
        }

        const payoutRequest = await AffiliatePayoutRequest.create({
            affiliateProfileId: profile._id,
            affiliateClientId: client._id,
            commissionIds: [],
            amount: requestedAmount,
            currency,
            status: AffiliatePayoutRequestStatus.PENDING,
            payoutDetails: payload.payoutDetails || profile.payoutDetails,
            requestedAt: new Date(),
        });

        const allocatedCommissionIds = await this.allocateApprovedAmount({
            profileId: profile._id as mongoose.Types.ObjectId,
            currency,
            amount: requestedAmount,
            status: AffiliateCommissionStatus.PAYOUT_REQUESTED,
            notes: 'Reserved for payout request',
            payoutRequestId: payoutRequest._id as mongoose.Types.ObjectId,
        });
        payoutRequest.commissionIds = allocatedCommissionIds as any;
        await payoutRequest.save();

        if (payload.payoutDetails) {
            profile.payoutDetails = payload.payoutDetails;
            await profile.save();
        }

        await this.syncProfileStats(profile._id);

        auditLogSafe({
            message: `Affiliate payout requested by client ${client.clientId}`,
            type: 'affiliate_payout_requested' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: client.user as any,
            source: 'manual',
            status: 'success',
            clientId: client._id as any,
            meta: { amount: requestedAmount, currency } as Record<string, unknown>,
        });

        return payoutRequest;
    }

    async getAdminDashboard() {
        await this.approveEligibleCommissions();

        const [payoutRequests, transactionMap, settings] = await Promise.all([
            AffiliatePayoutRequest.find({})
                .populate('affiliateClientId', 'clientId firstName lastName contactEmail')
                .populate('affiliateProfileId', 'referralCode')
                .sort({ createdAt: -1 })
                .limit(200)
                .lean(),
            PaymentTransaction.find({})
                .sort({ createdAt: -1 })
                .select('_id invoiceId externalTransactionId')
                .limit(200)
                .lean(),
            this.getAffiliateSettings().then((item) => item.toObject()),
        ]);

        const recentTransactionsByInvoice = new Map<string, string>();
        for (const tx of transactionMap) {
            if (tx.invoiceId) {
                recentTransactionsByInvoice.set(String(tx.invoiceId), tx.externalTransactionId || String(tx._id));
            }
        }

        return {
            settings,
            payoutRequests,
            recentTransactionsByInvoice: Object.fromEntries(recentTransactionsByInvoice),
        };
    }

    async updateDefaultSettings(
        payload: { defaultCommissionRate: number; defaultReferralDiscountRate: number; defaultPayoutThreshold: number },
        actorUserId: string
    ) {
        const defaultCommissionRate = round2(Number(payload.defaultCommissionRate));
        const defaultReferralDiscountRate = round2(Number(payload.defaultReferralDiscountRate));
        const defaultPayoutThreshold = round2(Number(payload.defaultPayoutThreshold));
        if (Number.isNaN(defaultCommissionRate) || defaultCommissionRate < 0 || defaultCommissionRate > 100) {
            throw new ApiError(400, 'Default commission rate must be between 0 and 100');
        }
        if (
            Number.isNaN(defaultReferralDiscountRate) ||
            defaultReferralDiscountRate < 0 ||
            defaultReferralDiscountRate > 100
        ) {
            throw new ApiError(400, 'Default buyer discount rate must be between 0 and 100');
        }
        if (Number.isNaN(defaultPayoutThreshold) || defaultPayoutThreshold < 0) {
            throw new ApiError(400, 'Default payout threshold must be zero or more');
        }

        const settings = await this.getAffiliateSettings();
        settings.defaultCommissionRate = defaultCommissionRate;
        settings.defaultReferralDiscountRate = defaultReferralDiscountRate;
        settings.defaultPayoutThreshold = defaultPayoutThreshold;
        await settings.save();

        auditLogSafe({
            message: `Default affiliate settings updated`,
            type: 'affiliate_settings_updated' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: actorUserId as any,
            source: 'manual',
            status: 'success',
            meta: { defaultCommissionRate, defaultReferralDiscountRate, defaultPayoutThreshold } as Record<string, unknown>,
        });

        return settings.toObject();
    }

    async updateClientAffiliateSettings(
        clientId: string,
        payload: { commissionRate: number; referralDiscountRate: number; payoutThreshold: number },
        actorUserId: string
    ) {
        const commissionRate = round2(Number(payload.commissionRate));
        const referralDiscountRate = round2(Number(payload.referralDiscountRate));
        const payoutThreshold = round2(Number(payload.payoutThreshold));
        if (Number.isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
            throw new ApiError(400, 'Commission rate must be between 0 and 100');
        }
        if (Number.isNaN(referralDiscountRate) || referralDiscountRate < 0 || referralDiscountRate > 100) {
            throw new ApiError(400, 'Buyer discount rate must be between 0 and 100');
        }
        if (Number.isNaN(payoutThreshold) || payoutThreshold < 0) {
            throw new ApiError(400, 'Payout threshold must be zero or more');
        }

        const profile = await AffiliateProfile.findOne({ clientId: new mongoose.Types.ObjectId(clientId) }).exec();
        if (!profile) {
            throw new ApiError(404, 'Affiliate profile not found');
        }

        profile.commissionRate = commissionRate;
        profile.referralDiscountRate = referralDiscountRate;
        profile.payoutThreshold = payoutThreshold;
        await profile.save();

        auditLogSafe({
            message: `Affiliate rates updated for ${profile.referralCode}`,
            type: 'affiliate_settings_updated' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: actorUserId as any,
            source: 'manual',
            status: 'success',
            clientId: profile.clientId as any,
            meta: {
                clientId,
                commissionRate,
                referralDiscountRate,
                payoutThreshold,
                referralCode: profile.referralCode,
            } as Record<string, unknown>,
        });

        return profile.toObject();
    }

    async updateClientAffiliateStatus(
        clientId: string,
        payload: { status: AffiliateProfileStatus },
        actorUserId: string
    ) {
        const profile = await AffiliateProfile.findOne({ clientId: new mongoose.Types.ObjectId(clientId) }).exec();
        if (!profile) {
            throw new ApiError(404, 'Affiliate profile not found');
        }

        if (![AffiliateProfileStatus.ACTIVE, AffiliateProfileStatus.PAUSED].includes(payload.status)) {
            throw new ApiError(400, 'Invalid affiliate status');
        }

        profile.status = payload.status;
        await profile.save();

        auditLogSafe({
            message: `Affiliate status updated for ${profile.referralCode}`,
            type: 'affiliate_settings_updated' as any,
            category: 'affiliate' as any,
            actorType: 'user',
            actorId: actorUserId as any,
            source: 'manual',
            status: 'success',
            clientId: profile.clientId as any,
            meta: { clientId, status: payload.status, referralCode: profile.referralCode } as Record<string, unknown>,
        });

        return profile.toObject();
    }

    async reviewPayoutRequest(
        payoutRequestId: string,
        payload: { action: 'approve' | 'reject' | 'mark_paid'; notes?: string },
        reviewerUserId: string
    ) {
        const payoutRequest = await AffiliatePayoutRequest.findById(payoutRequestId).exec();
        if (!payoutRequest) {
            throw new ApiError(404, 'Payout request not found');
        }

        const profile = await AffiliateProfile.findById(payoutRequest.affiliateProfileId).exec();
        if (!profile) {
            throw new ApiError(404, 'Affiliate profile not found');
        }

        const now = new Date();
        if (payload.action === 'approve') {
            if (payoutRequest.status !== AffiliatePayoutRequestStatus.PENDING) {
                throw new ApiError(400, 'Only pending payout requests can be approved');
            }
            payoutRequest.status = AffiliatePayoutRequestStatus.APPROVED;
            payoutRequest.reviewedAt = now;
            payoutRequest.reviewedByUserId = new mongoose.Types.ObjectId(reviewerUserId);
            payoutRequest.reviewNotes = payload.notes;
            await payoutRequest.save();

            auditLogSafe({
                message: `Affiliate payout approved`,
                type: 'affiliate_payout_approved' as any,
                category: 'affiliate' as any,
                actorType: 'user',
                actorId: reviewerUserId as any,
                source: 'manual',
                status: 'success',
                clientId: payoutRequest.affiliateClientId as any,
                meta: { payoutRequestId } as Record<string, unknown>,
            });
        } else if (payload.action === 'reject') {
            if (![AffiliatePayoutRequestStatus.PENDING, AffiliatePayoutRequestStatus.APPROVED].includes(payoutRequest.status)) {
                throw new ApiError(400, 'Only pending or approved payout requests can be rejected');
            }
            payoutRequest.status = AffiliatePayoutRequestStatus.REJECTED;
            payoutRequest.reviewedAt = now;
            payoutRequest.reviewedByUserId = new mongoose.Types.ObjectId(reviewerUserId);
            payoutRequest.reviewNotes = payload.notes;
            await payoutRequest.save();

            await AffiliateCommission.updateMany(
                { payoutRequestId: payoutRequest._id, status: AffiliateCommissionStatus.PAYOUT_REQUESTED },
                {
                    $set: { status: AffiliateCommissionStatus.APPROVED, notes: 'Payout request rejected' },
                    $unset: { payoutRequestId: 1 },
                }
            ).exec();

            auditLogSafe({
                message: `Affiliate payout rejected`,
                type: 'affiliate_payout_rejected' as any,
                category: 'affiliate' as any,
                actorType: 'user',
                actorId: reviewerUserId as any,
                source: 'manual',
                status: 'success',
                clientId: payoutRequest.affiliateClientId as any,
                meta: { payoutRequestId } as Record<string, unknown>,
            });
        } else {
            if (payoutRequest.status !== AffiliatePayoutRequestStatus.APPROVED) {
                throw new ApiError(400, 'Only approved payout requests can be marked as paid');
            }
            payoutRequest.status = AffiliatePayoutRequestStatus.PAID;
            payoutRequest.paidAt = now;
            payoutRequest.reviewedAt = now;
            payoutRequest.reviewedByUserId = new mongoose.Types.ObjectId(reviewerUserId);
            payoutRequest.reviewNotes = payload.notes;
            await payoutRequest.save();

            await AffiliateCommission.updateMany(
                { payoutRequestId: payoutRequest._id, status: AffiliateCommissionStatus.PAYOUT_REQUESTED },
                {
                    $set: {
                        status: AffiliateCommissionStatus.PAID_OUT,
                        redeemedAt: now,
                        notes: 'Marked as paid out by admin',
                    },
                }
            ).exec();

            auditLogSafe({
                message: `Affiliate payout marked as paid`,
                type: 'affiliate_payout_paid' as any,
                category: 'affiliate' as any,
                actorType: 'user',
                actorId: reviewerUserId as any,
                source: 'manual',
                status: 'success',
                clientId: payoutRequest.affiliateClientId as any,
                meta: { payoutRequestId } as Record<string, unknown>,
            });
        }

        await this.syncProfileStats(profile._id);
        return payoutRequest;
    }
}

export const affiliateService = new AffiliateService();

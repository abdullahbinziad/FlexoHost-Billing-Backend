import { Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import type { AuthRequest } from '../../middlewares/auth';
import { affiliateService } from './affiliate.service';

class AffiliateController {
    enroll = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.ensureEnrollmentForUser(req.user._id.toString());
        return ApiResponse.ok(res, 'Affiliate profile ready', result);
    });

    getMyDashboard = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.getClientDashboard(req.user._id.toString());
        return ApiResponse.ok(res, 'Affiliate dashboard retrieved successfully', result);
    });

    updateMyReferralCode = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.updateMyReferralCode(req.user._id.toString(), req.body);
        return ApiResponse.ok(res, 'Referral code updated successfully', result);
    });

    regenerateMyReferralCode = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.regenerateMyReferralCode(req.user._id.toString());
        return ApiResponse.ok(res, 'Referral code regenerated successfully', result);
    });

    redeemToCredit = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.redeemToCreditForUser(req.user._id.toString(), req.body);
        return ApiResponse.ok(res, 'Affiliate earnings converted to account credit', result);
    });

    requestPayout = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.createPayoutRequestForUser(req.user._id.toString(), req.body);
        return ApiResponse.created(res, 'Affiliate payout request created successfully', result);
    });

    getAdminDashboard = catchAsync(async (_req: AuthRequest, res: Response) => {
        const result = await affiliateService.getAdminDashboard();
        return ApiResponse.ok(res, 'Affiliate admin dashboard retrieved successfully', result);
    });

    updateDefaultSettings = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.updateDefaultSettings(req.body, req.user._id.toString());
        return ApiResponse.ok(res, 'Default affiliate settings updated successfully', result);
    });

    getAdminClientAffiliate = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.getAdminClientAffiliate(req.params.clientId);
        return ApiResponse.ok(res, 'Client affiliate details retrieved successfully', result);
    });

    enrollClientAffiliate = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.enrollClientByAdmin(req.params.clientId, req.user._id.toString());
        return ApiResponse.created(res, 'Affiliate profile created successfully', result);
    });

    updateClientAffiliateSettings = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.updateClientAffiliateSettings(
            req.params.clientId,
            req.body,
            req.user._id.toString()
        );
        return ApiResponse.ok(res, 'Client affiliate settings updated successfully', result);
    });

    updateClientAffiliateStatus = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.updateClientAffiliateStatus(
            req.params.clientId,
            req.body,
            req.user._id.toString()
        );
        return ApiResponse.ok(res, 'Client affiliate status updated successfully', result);
    });

    reviewPayoutRequest = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.reviewPayoutRequest(
            req.params.id,
            req.body,
            req.user._id.toString()
        );
        return ApiResponse.ok(res, 'Affiliate payout request updated successfully', result);
    });

    updateClientAffiliateReferralCode = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.updateClientAffiliateReferralCode(
            req.params.clientId,
            req.body,
            req.user._id.toString()
        );
        return ApiResponse.ok(res, 'Client affiliate referral code updated successfully', result);
    });

    regenerateClientAffiliateReferralCode = catchAsync(async (req: AuthRequest, res: Response) => {
        const result = await affiliateService.regenerateClientAffiliateReferralCode(
            req.params.clientId,
            req.user._id.toString()
        );
        return ApiResponse.ok(res, 'Client affiliate referral code regenerated successfully', result);
    });
}

export const affiliateController = new AffiliateController();

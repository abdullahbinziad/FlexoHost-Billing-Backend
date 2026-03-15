import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { affiliateController } from './affiliate.controller';
import {
    createAffiliatePayoutRequestValidation,
    redeemAffiliateCreditValidation,
    reviewAffiliatePayoutValidation,
    updateAffiliateClientSettingsValidation,
    updateAffiliateClientStatusValidation,
    updateAffiliateDefaultSettingsValidation,
    updateMyAffiliateReferralCodeValidation,
} from './affiliate.validation';

const router = Router();

router.use(protect);

router.post(
    '/enroll',
    restrictTo('client', 'user', 'admin', 'staff', 'superadmin'),
    affiliateController.enroll
);
router.get(
    '/me',
    restrictTo('client', 'user', 'admin', 'staff', 'superadmin'),
    affiliateController.getMyDashboard
);
router.patch(
    '/me/referral-code',
    restrictTo('client', 'user', 'admin', 'staff', 'superadmin'),
    validate(updateMyAffiliateReferralCodeValidation),
    affiliateController.updateMyReferralCode
);
router.post(
    '/me/referral-code/regenerate',
    restrictTo('client', 'user', 'admin', 'staff', 'superadmin'),
    affiliateController.regenerateMyReferralCode
);
router.post(
    '/me/redeem-credit',
    restrictTo('client', 'user', 'admin', 'staff', 'superadmin'),
    validate(redeemAffiliateCreditValidation),
    affiliateController.redeemToCredit
);
router.post(
    '/me/payout-requests',
    restrictTo('client', 'user', 'admin', 'staff', 'superadmin'),
    validate(createAffiliatePayoutRequestValidation),
    affiliateController.requestPayout
);

router.get(
    '/admin/dashboard',
    restrictTo('superadmin', 'admin', 'staff'),
    affiliateController.getAdminDashboard
);
router.get(
    '/admin/clients/:clientId',
    restrictTo('superadmin', 'admin', 'staff'),
    affiliateController.getAdminClientAffiliate
);
router.post(
    '/admin/clients/:clientId/enroll',
    restrictTo('superadmin', 'admin', 'staff'),
    affiliateController.enrollClientAffiliate
);
router.patch(
    '/admin/settings',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(updateAffiliateDefaultSettingsValidation),
    affiliateController.updateDefaultSettings
);
router.patch(
    '/admin/clients/:clientId/settings',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(updateAffiliateClientSettingsValidation),
    affiliateController.updateClientAffiliateSettings
);
router.patch(
    '/admin/clients/:clientId/status',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(updateAffiliateClientStatusValidation),
    affiliateController.updateClientAffiliateStatus
);
router.patch(
    '/admin/payout-requests/:id',
    restrictTo('superadmin', 'admin', 'staff'),
    validate(reviewAffiliatePayoutValidation),
    affiliateController.reviewPayoutRequest
);

export default router;

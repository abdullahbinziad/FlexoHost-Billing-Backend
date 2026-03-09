import { Router } from 'express';
import { promotionController } from './promotion.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
    createPromotionValidation,
    updatePromotionValidation,
    getPromotionValidation,
    deletePromotionValidation,
    toggleActiveValidation,
    getPromotionsQueryValidation,
    validateCouponValidation,
} from './promotion.validation';

const router = Router();

/**
 * Public route - validate coupon (for checkout)
 */
router.post('/validate', validate(validateCouponValidation), promotionController.validateCoupon);

/**
 * Admin routes - require authentication and admin role
 */
router.use(protect);
router.use(restrictTo('admin', 'superadmin'));

router
    .route('/')
    .get(validate(getPromotionsQueryValidation), promotionController.getAll)
    .post(validate(createPromotionValidation), promotionController.create);

router
    .route('/:id')
    .get(validate(getPromotionValidation), promotionController.getOne)
    .put(validate(updatePromotionValidation), promotionController.update)
    .delete(validate(deletePromotionValidation), promotionController.delete);

router.patch('/:id/toggle', validate(toggleActiveValidation), promotionController.toggleActive);
router.get('/:id/usage', validate(getPromotionValidation), promotionController.getUsageStats);

export default router;

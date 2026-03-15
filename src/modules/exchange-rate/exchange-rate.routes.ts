import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { getRateForDate, setRate } from './fx.service';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import ApiError from '../../utils/apiError';

const router = Router();
router.use(protect);

/** Get rate for a currency at a date (for display/validation) */
router.get(
    '/rate',
    restrictTo('admin', 'staff'),
    catchAsync(async (req, res) => {
        const date = req.query.date as string;
        const currency = (req.query.currency as string)?.trim()?.toUpperCase();
        if (!date || !currency) {
            throw new ApiError(400, 'Query params date and currency are required');
        }
        const { rate, isFallback } = await getRateForDate(currency, new Date(date));
        return ApiResponse.ok(res, 'Rate retrieved', { date, currency, rate, isFallback });
    })
);

/** Set historical rate (admin only) */
router.post(
    '/rate',
    restrictTo('admin'),
    catchAsync(async (req, res) => {
        const { date, currency, rateToBase } = req.body;
        if (!date || !currency || rateToBase == null) {
            throw new ApiError(400, 'Body must include date, currency, rateToBase');
        }
        await setRate(new Date(date), currency, Number(rateToBase));
        return ApiResponse.ok(res, 'Rate set successfully');
    })
);

export default router;

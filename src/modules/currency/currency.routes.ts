import { Router } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import currencyService from './currency.service';

const router = Router();

router.use(protect);

router.get(
    '/enabled',
    catchAsync(async (_req, res) => {
        const result = await currencyService.listEnabled();
        return ApiResponse.ok(res, 'Enabled currencies retrieved', result);
    })
);

router.get(
    '/admin',
    restrictTo('admin', 'staff', 'superadmin'),
    catchAsync(async (_req, res) => {
        const currencies = await currencyService.listAdmin();
        return ApiResponse.ok(res, 'Currencies retrieved', { currencies });
    })
);

router.put(
    '/admin/:code',
    restrictTo('admin', 'superadmin'),
    catchAsync(async (req, res) => {
        const currency = await currencyService.upsert({ ...req.body, code: req.params.code });
        return ApiResponse.ok(res, 'Currency saved', { currency });
    })
);

export default router;

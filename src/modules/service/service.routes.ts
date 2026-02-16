import express from 'express';
import { serviceController } from './service.controller';
import { protect } from '../../middlewares/auth';

const router = express.Router();

router.get(
    '/',
    protect,
    serviceController.getServices
);

router.get(
    '/:id',
    protect,
    serviceController.getService
);

export default router;

import express from 'express';
import { orderController } from './order.controller';
import { protect, optionalAuth } from '../../middlewares/auth';

const router = express.Router();

router.post(
    '/',
    optionalAuth,
    orderController.createOrder
);

router.get(
    '/',
    protect,
    orderController.getOrders
);

router.get(
    '/:id',
    protect,
    orderController.getOrder
);

router.patch(
    '/:id/status',
    protect,
    orderController.updateOrderStatus
);

router.post(
    '/:id/run-module-create',
    protect,
    orderController.runModuleCreate
);

export default router;
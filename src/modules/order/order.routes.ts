import express from 'express';
import { orderController } from './order.controller';
import { protect } from '../../middlewares/auth';

const router = express.Router();

router.get('/config', protect, orderController.getOrderConfig);

router.post(
    '/',
    protect,
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
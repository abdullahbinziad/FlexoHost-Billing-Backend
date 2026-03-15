import express from 'express';
import { orderController } from './order.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { bulkOrderIdsValidation, bulkSendMessageValidation } from './order.validation';

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

// Bulk actions - must be before /:id to avoid "bulk" being matched as id
router.post(
    '/bulk/accept',
    protect,
    restrictTo('superadmin', 'admin', 'staff'),
    validate(bulkOrderIdsValidation),
    orderController.bulkAcceptOrders
);
router.post(
    '/bulk/cancel',
    protect,
    restrictTo('superadmin', 'admin', 'staff'),
    validate(bulkOrderIdsValidation),
    orderController.bulkCancelOrders
);
router.post(
    '/bulk/delete',
    protect,
    restrictTo('superadmin', 'admin', 'staff'),
    validate(bulkOrderIdsValidation),
    orderController.bulkDeleteOrders
);
router.post(
    '/bulk/send-message',
    protect,
    restrictTo('superadmin', 'admin', 'staff'),
    validate(bulkSendMessageValidation),
    orderController.bulkSendMessage
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
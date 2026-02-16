import express from 'express';
import * as controller from './whm.controller';
import { protect, restrictTo } from '../../middlewares/auth';

const router = express.Router();

// All routes are protected and restricted to admin
router.use(protect, restrictTo('admin'));

router.post('/create', controller.createCpanel);
router.post('/suspend/:username', controller.suspend);
router.post('/unsuspend/:username', controller.unsuspend);
router.delete('/terminate/:username', controller.terminate);
router.put('/change-package/:username', controller.changePackage);
router.put('/change-password/:username', controller.changePassword);
router.get('/summary/:username', controller.getAccountSummary);
router.get('/verify/:username', controller.verifyUser);

export default router;

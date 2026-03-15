import { Router } from 'express';
import uploadController from './upload.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { upload, handleMulterError } from '../../middlewares/upload';
import { virusScanUpload } from '../../middlewares/virusScanUpload';

const router = Router();

router.use(protect);
router.post(
    '/',
    restrictTo('client', 'user', 'admin', 'staff'),
    upload.single('file'),
    handleMulterError,
    virusScanUpload,
    uploadController.upload
);

export default router;

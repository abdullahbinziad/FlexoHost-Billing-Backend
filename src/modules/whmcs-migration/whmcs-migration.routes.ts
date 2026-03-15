import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import config from '../../config';
import { protect, restrictTo } from '../../middlewares/auth';
import { uploadAndMigrate } from './whmcs-migration.controller';
import ApiError from '../../utils/apiError';

const uploadDir = path.join(process.cwd(), config.upload.uploadPath, 'whmcs-migration');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.sql';
        cb(null, `whmcs-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = file.originalname.toLowerCase();
        if (ext.endsWith('.sql') || ext.endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Only .sql and .zip files are allowed'));
        }
    },
});

const handleMulterErr = (err: any, _req: any, _res: any, next: any) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') throw ApiError.badRequest('File too large. Maximum size is 200MB.');
        throw ApiError.badRequest(err.message);
    }
    if (err) throw ApiError.badRequest(err.message);
    next();
};

const router = Router();
router.use(protect);
router.use(restrictTo('admin', 'superadmin'));

router.post('/upload-and-migrate', upload.single('file'), handleMulterErr, uploadAndMigrate);

export default router;

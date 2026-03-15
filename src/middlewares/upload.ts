import multer from 'multer';
import path from 'path';
import fs from 'fs';
import config from '../config';
import ApiError from '../utils/apiError';

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), config.upload.uploadPath);
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        void req;
        void file;
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        void req;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});

// Strict allowlist: extension -> expected MIME types (client mimetype can be spoofed; we validate extension strictly)
const ALLOWED_EXT_MIME: Record<string, string[]> = {
    '.jpg': ['image/jpeg', 'image/jpg'],
    '.jpeg': ['image/jpeg', 'image/jpg'],
    '.png': ['image/png'],
    '.gif': ['image/gif'],
    '.webp': ['image/webp'],
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.txt': ['text/plain'],
};

// File filter – validate extension strictly and require matching MIME
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    void req;
    const ext = path.extname(file.originalname).toLowerCase().replace(/\.+$/, '') || '';
    const extWithDot = ext.startsWith('.') ? ext : '.' + ext;
    const allowed = ALLOWED_EXT_MIME[extWithDot];
    if (!allowed) {
        return cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, PDF, DOC, DOCX, and TXT are allowed.'));
    }
    const mimetype = (file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (!allowed.includes(mimetype)) {
        return cb(new Error(`Invalid file: extension ${extWithDot} does not match MIME type ${mimetype}.`));
    }
    cb(null, true);
};

// Create multer upload instance
export const upload = multer({
    storage: storage,
    limits: {
        fileSize: config.upload.maxFileSize, // 5MB default
    },
    fileFilter: fileFilter,
});

// Middleware to handle multer errors
export const handleMulterError = (err: any, req: any, res: any, next: any) => {
    void req;
    void res;
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            throw ApiError.badRequest('File too large. Maximum size is 5MB.');
        }
        throw ApiError.badRequest(err.message);
    } else if (err) {
        throw ApiError.badRequest(err.message);
    }
    next();
};

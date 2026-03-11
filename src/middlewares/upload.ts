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

// File filter
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    void req;
    // Allowed file types
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, DOCX, and TXT files are allowed.'));
    }
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

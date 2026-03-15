/**
 * Middleware to virus-scan uploaded files after multer.
 * When ENABLE_CLAMAV_SCAN=true and ClamAV is available, scans files and rejects if infected.
 * When disabled, passes through.
 */
import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { scanFiles } from '../utils/virusScan';
import ApiError from '../utils/apiError';

/**
 * Scan uploaded file(s) for malware. Use after multer middleware.
 * For single file: req.file
 * For multiple: req.files (array)
 */
export async function virusScanUpload(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const paths: string[] = [];
    const file = req.file as Express.Multer.File | undefined;
    const files = req.files as Express.Multer.File[] | undefined;
    if (file?.path) paths.push(path.resolve(file.path));
    if (files && Array.isArray(files)) {
        for (const f of files) {
            if (f.path) paths.push(path.resolve(f.path));
        }
    }
    if (paths.length === 0) return next();

    const result = await scanFiles(paths);
    if (result.infected || !result.ok) {
        for (const p of paths) {
            try {
                if (fs.existsSync(p)) fs.unlinkSync(p);
            } catch {
                // ignore cleanup errors
            }
        }
        throw ApiError.badRequest(result.message || 'File failed security scan. Upload rejected.');
    }
    next();
}

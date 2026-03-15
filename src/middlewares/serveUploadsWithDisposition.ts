/**
 * Serve uploaded files with Content-Disposition: attachment for non-image types.
 * Reduces risk of malicious PDF/DOC auto-execution or drive-by download.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import config from '../config';

const UPLOAD_PATH = path.resolve(process.cwd(), config.upload.uploadPath);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export function serveUploadsWithDisposition(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
): void {
    const relativePath = req.path.startsWith('/') ? req.path.slice(1) : req.path;
    const requestPath = path.join(UPLOAD_PATH, relativePath || '.');
    const resolved = path.resolve(requestPath);

    if (!resolved.startsWith(UPLOAD_PATH)) {
        return next();
    }
    const ext = path.extname(resolved).toLowerCase();
    if (!IMAGE_EXT.has(ext) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        res.setHeader('Content-Disposition', 'attachment');
    }
    next();
}

import path from 'path';
import fs from 'fs';

/**
 * Safely delete a file. Prevents path traversal – filePath must resolve within process.cwd().
 */
export const deleteFile = (filePath: string): void => {
    if (!filePath || typeof filePath !== 'string') return;
    const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.resolve(process.cwd(), normalized);
    const cwd = path.resolve(process.cwd());
    if (!fullPath.startsWith(cwd) || fullPath === cwd) return;
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
    }
};

export const getFileUrl = (filePath: string): string => {
    // In production, this would return a CDN URL or S3 URL
    return `/uploads/${path.basename(filePath)}`;
};

export const validateFileType = (
    filename: string,
    allowedTypes: string[]
): boolean => {
    const ext = path.extname(filename).toLowerCase();
    return allowedTypes.includes(ext);
};

export const generateUniqueFilename = (originalName: string): string => {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);

    return `${name}-${timestamp}-${random}${ext}`;
};

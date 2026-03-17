import { Request, Response } from 'express';
import fs from 'fs/promises';
import ApiResponse from '../../utils/apiResponse';
import catchAsync from '../../utils/catchAsync';
import { runWhmcsMigration } from './whmcs-migration.service';
import { auditLogSafe } from '../activity-log/activity-log.service';
import type { AuthRequest } from '../../middlewares/auth';

const unlinkSafe = (path: string) => fs.unlink(path).catch(() => {});

export const uploadAndMigrate = catchAsync(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        return ApiResponse.badRequest(res, 'No file uploaded. Please upload a .sql or .sql.zip file.');
    }

    const ext = file.originalname.toLowerCase();
    if (!ext.endsWith('.sql') && !ext.endsWith('.zip')) {
        unlinkSafe(file.path);
        return ApiResponse.badRequest(res, 'Invalid file type. Only .sql and .zip files are allowed.');
    }

    try {
        const result = await runWhmcsMigration(file.path);
        unlinkSafe(file.path);

        if (!result.success) {
            return ApiResponse.error(res, 400, result.error || 'Migration failed', result);
        }

        const authReq = req as AuthRequest;
        auditLogSafe({
            message: 'WHMCS migration completed successfully',
            type: 'settings_changed',
            category: 'other',
            actorType: authReq.user ? 'user' : 'system',
            actorId: authReq.user?._id?.toString?.(),
            source: 'manual',
            meta: { action: 'whmcs_migration', migration: result.migration } as Record<string, unknown>,
        });

        return ApiResponse.ok(res, 'Migration completed successfully', result);
    } catch (err: any) {
        unlinkSafe(file.path);
        return ApiResponse.error(res, 500, err?.message || 'Migration failed');
    }
});

import { Router, Request, Response } from 'express';
import { protect, restrictTo } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/requirePermission';
import { smtpTestRateLimit } from '../../middlewares/smtpTestRateLimit';
import { validate } from '../../middlewares/validate';
import { previewTemplate } from './preview';
import { validateProps } from './templates/schemas';
import { TEMPLATE_KEYS } from './templates/registry';
import { hasTemplate } from './templates/registry';
import ApiResponse from '../../utils/apiResponse';
import type { TemplateKey } from './templates/types';
import emailController from './email.controller';
import { sendBulkEmailValidation, testSmtpValidation } from './email.validation';

const router = Router();

/**
 * POST /email/send-bulk - Send email to multiple clients (admin/staff only)
 */
router.post(
    '/send-bulk',
    protect,
    restrictTo('superadmin', 'admin', 'staff'),
    validate(sendBulkEmailValidation),
    emailController.sendBulk
);

/**
 * POST /email/test — verify SMTP + send one test message (admin/staff)
 */
router.post(
    '/test',
    protect,
    restrictTo('superadmin', 'admin', 'staff'),
    requirePermission('settings:smtp'),
    smtpTestRateLimit,
    validate(testSmtpValidation),
    emailController.testSmtp
);

/**
 * GET /email/templates - List all template keys
 */
router.get('/templates', (_req: Request, res: Response) => {
    return ApiResponse.ok(res, 'Templates retrieved', { keys: TEMPLATE_KEYS });
});

/**
 * POST /email/preview - Render template with given props for admin preview
 * Validates props; returns structured validation errors on failure
 */
router.post('/preview', (req: Request, res: Response) => {
    const { templateKey, props } = req.body as { templateKey: string; props?: Record<string, unknown> };

    if (!templateKey) {
        return ApiResponse.badRequest(res, 'templateKey is required');
    }

    if (!hasTemplate(templateKey)) {
        return ApiResponse.badRequest(res, `Unknown template: ${templateKey}`);
    }

    const validation = validateProps(templateKey as TemplateKey, props || {});
    if (!validation.success) {
        return ApiResponse.badRequest(res, validation.message, { errors: validation.errors });
    }

    try {
        const result = previewTemplate(templateKey as TemplateKey, props);
        return ApiResponse.ok(res, 'Preview rendered', result);
    } catch (err: any) {
        return ApiResponse.badRequest(res, err?.message || 'Failed to render preview');
    }
});

export default router;

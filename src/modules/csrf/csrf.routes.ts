import { Router, Request, Response } from 'express';
import config from '../../config';
import { generateCsrfToken, setCsrfCookie } from '../../middlewares/csrf';
import ApiResponse from '../../utils/apiResponse';

const router = Router();

/**
 * GET /api/v1/csrf-token
 * Returns a CSRF token and sets it in a cookie for double-submit validation.
 * Frontend should call this on app load and include the token in X-CSRF-Token header for mutations.
 */
router.get('/csrf-token', (_req: Request, res: Response) => {
    if (!config.security.csrfEnabled) {
        return ApiResponse.ok(res, 'CSRF disabled', { token: '' });
    }
    const token = generateCsrfToken();
    setCsrfCookie(res, token);
    return ApiResponse.ok(res, 'CSRF token', { token });
});

export default router;

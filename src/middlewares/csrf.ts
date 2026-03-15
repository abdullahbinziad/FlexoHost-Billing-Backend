/**
 * CSRF protection using double-submit cookie pattern.
 * Validates X-CSRF-Token header against cookie for state-changing requests.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config';

const COOKIE_NAME = 'csrf-token';
const HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Paths that must skip CSRF validation (external callers, OAuth, etc.) */
const EXEMPT_PATHS: Array<string | RegExp> = [
    '/csrf-token',
    '/auth/google',
    '/auth/google/callback',
    '/payment/success',
    '/payment/fail',
    '/payment/cancel',
    '/payment/ipn',
];

function isExempt(path: string): boolean {
    const normalized = '/' + path.replace(/^\/+/, '').toLowerCase();
    for (const pattern of EXEMPT_PATHS) {
        if (typeof pattern === 'string') {
            const p = (pattern.startsWith('/') ? pattern : '/' + pattern).toLowerCase();
            if (normalized === p || normalized.startsWith(p + '/')) return true;
        } else if (pattern.test(path)) {
            return true;
        }
    }
    return false;
}

/** Check if request uses Bearer token (stateless; CSRF not needed) */
function hasBearerToken(req: Request): boolean {
    const auth = req.headers.authorization;
    return typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ');
}

/**
 * Generate a cryptographically secure CSRF token.
 */
export function generateCsrfToken(): string {
    return crypto.randomBytes(config.security.csrfTokenBytes).toString('hex');
}

/**
 * Set CSRF cookie and return token for double-submit.
 * Cookie is NOT HttpOnly so JS can read it; validation ensures header matches.
 */
export function setCsrfCookie(res: Response, token: string): void {
    const isProd = config.env === 'production';
    const opts: Record<string, string | number | boolean> = {
        path: '/',
        sameSite: 'lax',
        maxAge: 3600, // 1 hour
        httpOnly: false, // Double-submit: frontend must read and send in header
    };
    if (isProd) {
        opts.secure = true;
    }
    const parts = [`${COOKIE_NAME}=${token}`, `Path=${opts.path}`, `SameSite=${opts.sameSite}`, `Max-Age=${opts.maxAge}`];
    if (opts.secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Validate CSRF token for state-changing requests.
 * Skips: safe methods, Bearer auth, exempt paths.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
    if (!config.security.csrfEnabled) {
        return next();
    }

    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    const apiBase = `/api/${config.apiVersion}`;
    const pathWithoutBase = req.path.startsWith(apiBase) ? req.path.slice(apiBase.length) : req.path;
    if (isExempt(pathWithoutBase)) {
        return next();
    }

    if (hasBearerToken(req)) {
        return next();
    }

    const headerToken = req.headers[HEADER_NAME] as string | undefined;
    const cookieToken = req.cookies?.[COOKIE_NAME];

    const provided = (headerToken || '').trim();
    const expected = (cookieToken || '').trim();

    if (!provided || !expected) {
        res.status(403).json({
            success: false,
            message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
        });
        return;
    }

    // Timing-safe comparison to prevent timing attacks
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(403).json({
            success: false,
            message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
        });
        return;
    }

    next();
}

export { COOKIE_NAME, HEADER_NAME };

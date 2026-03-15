import crypto from 'crypto';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import config from '../../config';
import authService from './auth.service';
import type { GoogleProfile } from './auth.service';

const apiBase = `/api/${config.apiVersion}`;
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

const baseCookieOptions = {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax' as const,
};

class AuthController {
    private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
        // Access token cookie (optional convenience for cookie-based auth)
        res.cookie('jwt', accessToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });

        // Refresh token cookie (HTTP-only)
        res.cookie('refreshToken', refreshToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });
    }

    private clearAuthCookies(res: Response) {
        res.clearCookie('jwt', baseCookieOptions);
        res.clearCookie('refreshToken', baseCookieOptions);
    }

    // Register new user
    register = catchAsync(async (req: AuthRequest, res: Response) => {
        const { user, tokens } = await authService.register(req.body);

        this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

        const payload: Record<string, unknown> = { user };
        if (!config.cookieOnlyAuth) {
            payload.accessToken = tokens.accessToken;
            payload.refreshToken = tokens.refreshToken;
        }
        return ApiResponse.created(res, 'User registered successfully', payload);
    });

    // Login user
    login = catchAsync(async (req: AuthRequest, res: Response) => {
        try {
            const { user, tokens } = await authService.login(req.body);
            const { auditLogSafe } = await import('../activity-log/activity-log.service');
            const { default: Client } = await import('../client/client.model');
            const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
            const client = await Client.findOne({ user: user._id }).select('_id').lean();
            auditLogSafe({
                message: 'Login successful',
                type: 'login_success',
                category: 'auth',
                actorType: 'user',
                actorId: user._id?.toString(),
                clientId: (client as { _id?: { toString(): string } } | null)?._id?.toString(),
                source: 'manual',
                ipAddress: ip,
                userAgent: (req.headers['user-agent'] as string) || '',
            });
            this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
            const payload: Record<string, unknown> = { user };
            if (!config.cookieOnlyAuth) {
                payload.accessToken = tokens.accessToken;
                payload.refreshToken = tokens.refreshToken;
            }
            return ApiResponse.ok(res, 'Login successful', payload);
        } catch (err: any) {
            if (err?.statusCode === 401) {
                const { auditLogSafe } = await import('../activity-log/activity-log.service');
                const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '-';
                auditLogSafe({
                    message: 'Failed login attempt',
                    type: 'login_failed',
                    category: 'auth',
                    actorType: 'system',
                    source: 'manual',
                    status: 'failure',
                    severity: 'medium',
                    ipAddress: ip,
                    userAgent: (req.headers['user-agent'] as string) || '',
                });
            }
            throw err;
        }
    });

    // Logout user
    logout = catchAsync(async (req: AuthRequest, res: Response) => {
        await authService.logout(req.user._id.toString());

        this.clearAuthCookies(res);

        return ApiResponse.ok(res, 'Logout successful');
    });

    // Refresh access token
    refreshToken = catchAsync(async (req: AuthRequest, res: Response) => {
        const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

        const tokens = await authService.refreshToken(refreshToken);

        this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

        const payload: Record<string, unknown> = {};
        if (!config.cookieOnlyAuth) payload.accessToken = tokens.accessToken;
        return ApiResponse.ok(res, 'Token refreshed successfully', payload);
    });

    // Get current user
    getMe = catchAsync(async (req: AuthRequest, res: Response) => {
        const user = await authService.getMe(req.user._id.toString());

        return ApiResponse.ok(res, 'User retrieved successfully', { user });
    });

    // Change password
    changePassword = catchAsync(async (req: AuthRequest, res: Response) => {
        const { currentPassword, newPassword } = req.body;

        await authService.changePassword(req.user._id.toString(), currentPassword, newPassword);

        return ApiResponse.ok(res, 'Password changed successfully');
    });

    // Forgot password - never expose reset token in API response (security)
    forgotPassword = catchAsync(async (req: AuthRequest, res: Response) => {
        await authService.forgotPassword(req.body.email);
        return ApiResponse.ok(res, 'Password reset token sent to your email');
    });

    // Reset password
    resetPassword = catchAsync(async (req: AuthRequest, res: Response) => {
        const { token, password } = req.body;

        await authService.resetPassword(token, password);

        return ApiResponse.ok(res, 'Password reset successfully');
    });

    // Verify email
    verifyEmail = catchAsync(async (req: AuthRequest, res: Response) => {
        await authService.verifyEmail(req.params.token);

        return ApiResponse.ok(res, 'Email verified successfully');
    });

    /**
     * Redirect to Google OAuth consent screen.
     * state = optional frontend path to redirect after login (e.g. / or /admin).
     * Generates secure state token and verifies it on callback to prevent CSRF.
     */
    getGoogleAuth = catchAsync(async (req: Request, res: Response) => {
        if (!config.google.clientId) {
            return ApiResponse.badRequest(res, 'Google sign-in is not configured');
        }
        const redirectPath = typeof req.query.state === 'string' ? req.query.state.trim() : '';
        const stateToken = crypto.randomBytes(32).toString('base64url');
        const state = `${stateToken}:${redirectPath || '/'}`;

        res.cookie(OAUTH_STATE_COOKIE, stateToken, {
            ...baseCookieOptions,
            maxAge: OAUTH_STATE_MAX_AGE_MS,
        });

        const callbackUrl = `${req.protocol}://${req.get('host')}${apiBase}/auth/google/callback`;
        const scope = 'openid email profile';
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.searchParams.set('client_id', config.google.clientId);
        url.searchParams.set('redirect_uri', callbackUrl);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', scope);
        url.searchParams.set('state', state);
        url.searchParams.set('access_type', 'offline');
        url.searchParams.set('prompt', 'consent');
        return res.redirect(url.toString());
    });

    /**
     * Google OAuth callback: exchange code for profile, find/create user, redirect to frontend with token.
     * Validates state to prevent CSRF.
     */
    getGoogleCallback = catchAsync(async (req: Request, res: Response) => {
        if (!config.google.clientId || !config.google.clientSecret) {
            return res.redirect(`${config.frontendUrl}/login?error=google_not_configured`);
        }
        const code = req.query.code as string;
        const stateParam = (typeof req.query.state === 'string' ? req.query.state : '').trim();
        if (!code) {
            return res.redirect(`${config.frontendUrl}/login?error=missing_code`);
        }

        const storedToken = req.cookies?.[OAUTH_STATE_COOKIE];
        res.clearCookie(OAUTH_STATE_COOKIE, baseCookieOptions);
        if (!storedToken || !stateParam) {
            return res.redirect(`${config.frontendUrl}/login?error=invalid_state`);
        }
        const [stateToken, redirectPath] = stateParam.includes(':') ? stateParam.split(':') : [stateParam, '/'];
        if (stateToken !== storedToken || stateToken.length < 16) {
            return res.redirect(`${config.frontendUrl}/login?error=invalid_state`);
        }

        const callbackUrl = `${req.protocol}://${req.get('host')}${apiBase}/auth/google/callback`;

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: config.google.clientId,
                client_secret: config.google.clientSecret,
                redirect_uri: callbackUrl,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            console.error('Google token error:', err);
            return res.redirect(`${config.frontendUrl}/login?error=token_exchange_failed`);
        }

        const tokenData = (await tokenRes.json()) as { access_token?: string };
        const accessToken = tokenData.access_token;
        if (!accessToken) {
            return res.redirect(`${config.frontendUrl}/login?error=no_access_token`);
        }

        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userInfoRes.ok) {
            return res.redirect(`${config.frontendUrl}/login?error=userinfo_failed`);
        }
        const profile = (await userInfoRes.json()) as GoogleProfile;

        const { tokens } = await authService.loginWithGoogle(profile);

        this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

        const safeRedirect = (redirectPath || '/').replace(/^\/+/, '/') || '/';
        // Include refreshToken so frontend can store it (cookies set here are for backend domain only)
        const hash = `accessToken=${encodeURIComponent(tokens.accessToken)}&refreshToken=${encodeURIComponent(tokens.refreshToken)}&redirect=${encodeURIComponent(safeRedirect)}`;
        return res.redirect(`${config.frontendUrl}/login#${hash}`);
    });
}

export default new AuthController();


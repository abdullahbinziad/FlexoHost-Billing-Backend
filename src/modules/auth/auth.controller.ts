import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import config from '../../config';
import authService from './auth.service';
import type { GoogleProfile } from './auth.service';

const apiBase = `/api/${config.apiVersion}`;

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

        return ApiResponse.created(res, 'User registered successfully', {
            user,
            accessToken: tokens.accessToken,
        });
    });

    // Login user
    login = catchAsync(async (req: AuthRequest, res: Response) => {
        const { user, tokens } = await authService.login(req.body);

        this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

        return ApiResponse.ok(res, 'Login successful', {
            user,
            accessToken: tokens.accessToken,
        });
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

        return ApiResponse.ok(res, 'Token refreshed successfully', {
            accessToken: tokens.accessToken,
        });
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

    // Forgot password
    forgotPassword = catchAsync(async (req: AuthRequest, res: Response) => {
        const resetToken = await authService.forgotPassword(req.body.email);

        const response =
            config.env === 'development'
                ? { message: 'Password reset token sent', resetToken }
                : { message: 'Password reset token sent to your email' };

        return ApiResponse.ok(
            res,
            response.message,
            config.env === 'development' ? { resetToken } : undefined
        );
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
     */
    getGoogleAuth = catchAsync(async (req: Request, res: Response) => {
        if (!config.google.clientId) {
            return ApiResponse.badRequest(res, 'Google sign-in is not configured');
        }
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        const callbackUrl = `${req.protocol}://${req.get('host')}${apiBase}/auth/google/callback`;
        const scope = 'openid email profile';
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.searchParams.set('client_id', config.google.clientId);
        url.searchParams.set('redirect_uri', callbackUrl);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', scope);
        if (state) url.searchParams.set('state', state);
        url.searchParams.set('access_type', 'offline');
        url.searchParams.set('prompt', 'consent');
        return res.redirect(url.toString());
    });

    /**
     * Google OAuth callback: exchange code for profile, find/create user, redirect to frontend with token.
     */
    getGoogleCallback = catchAsync(async (req: Request, res: Response) => {
        if (!config.google.clientId || !config.google.clientSecret) {
            return res.redirect(`${config.frontendUrl}/login?error=google_not_configured`);
        }
        const code = req.query.code as string;
        const state = (typeof req.query.state === 'string' ? req.query.state : '').trim();
        if (!code) {
            return res.redirect(`${config.frontendUrl}/login?error=missing_code`);
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

        const { user, tokens } = await authService.loginWithGoogle(profile);

        this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

        const redirectPath = state || '/';
        const hash = `accessToken=${encodeURIComponent(tokens.accessToken)}&redirect=${encodeURIComponent(redirectPath)}`;
        return res.redirect(`${config.frontendUrl}/login#${hash}`);
    });
}

export default new AuthController();


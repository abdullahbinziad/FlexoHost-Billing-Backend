import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import config from '../../config';
import authService from './auth.service';

const baseCookieOptions = {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'strict' as const,
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
}

export default new AuthController();


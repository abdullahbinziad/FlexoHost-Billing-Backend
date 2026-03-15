import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import userService from './user.service';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import config from '../../config';
import { auditLogSafe } from '../activity-log/activity-log.service';

const baseCookieOptions = {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'strict' as const,
};

class UserController {
    // Register new user
    register = catchAsync(async (req: AuthRequest, res: Response) => {
        const { user, tokens } = await userService.register(req.body);

        // Set tokens in HTTP-only cookies (convenience; access token is also returned in JSON)
        res.cookie('jwt', tokens.accessToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });
        res.cookie('refreshToken', tokens.refreshToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });

        return ApiResponse.created(res, 'User registered successfully', {
            user,
            accessToken: tokens.accessToken,
        });
    });

    // Login user
    login = catchAsync(async (req: AuthRequest, res: Response) => {
        const { user, tokens } = await userService.login(req.body);

        // Set tokens in HTTP-only cookies (convenience; access token is also returned in JSON)
        res.cookie('jwt', tokens.accessToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });
        res.cookie('refreshToken', tokens.refreshToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });

        return ApiResponse.ok(res, 'Login successful', {
            user,
            accessToken: tokens.accessToken,
        });
    });

    // Logout user
    logout = catchAsync(async (req: AuthRequest, res: Response) => {
        await userService.logout(req.user._id.toString());

        // Clear refresh token cookie
        res.clearCookie('refreshToken', baseCookieOptions);
        res.clearCookie('jwt', baseCookieOptions);

        return ApiResponse.ok(res, 'Logout successful');
    });

    // Refresh access token
    refreshToken = catchAsync(async (req: AuthRequest, res: Response) => {
        const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

        const tokens = await userService.refreshToken(refreshToken);

        // Update tokens in cookies
        res.cookie('jwt', tokens.accessToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });
        res.cookie('refreshToken', tokens.refreshToken, {
            ...baseCookieOptions,
            maxAge: config.jwt.cookieExpiresIn * 24 * 60 * 60 * 1000,
        });

        return ApiResponse.ok(res, 'Token refreshed successfully', {
            accessToken: tokens.accessToken,
        });
    });

    // Get current user
    getMe = catchAsync(async (req: AuthRequest, res: Response) => {
        const user = await userService.getUserById(req.user._id);

        return ApiResponse.ok(res, 'User retrieved successfully', { user });
    });

    // Get user by ID
    getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
        const user = await userService.getUserById(req.params.id, { includeInactive: true });

        return ApiResponse.ok(res, 'User retrieved successfully', { user });
    });

    // Update current user - whitelist to prevent mass assignment (role, active, etc.)
    updateMe = catchAsync(async (req: AuthRequest, res: Response) => {
        const allowed = ['email'];
        const updates: Record<string, unknown> = {};
        for (const k of allowed) {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        }
        const user = await userService.updateUser(req.user._id.toString(), updates as any);

        return ApiResponse.ok(res, 'User updated successfully', { user });
    });

    // Change password
    changePassword = catchAsync(async (req: AuthRequest, res: Response) => {
        const { currentPassword, newPassword } = req.body;

        await userService.changePassword(req.user._id.toString(), currentPassword, newPassword);

        return ApiResponse.ok(res, 'Password changed successfully');
    });

    // Forgot password
    forgotPassword = catchAsync(async (req: AuthRequest, res: Response) => {
        const resetToken = await userService.forgotPassword(req.body.email);

        // In development, return token (in production, send via email)
        const response = config.env === 'development'
            ? { message: 'Password reset token sent', resetToken }
            : { message: 'Password reset token sent to your email' };

        return ApiResponse.ok(res, response.message,
            config.env === 'development' ? { resetToken } : undefined
        );
    });

    // Reset password
    resetPassword = catchAsync(async (req: AuthRequest, res: Response) => {
        const { token, password } = req.body;

        await userService.resetPassword(token, password);

        return ApiResponse.ok(res, 'Password reset successfully');
    });

    // Verify email
    verifyEmail = catchAsync(async (req: AuthRequest, res: Response) => {
        await userService.verifyEmail(req.params.token);

        return ApiResponse.ok(res, 'Email verified successfully');
    });

    // Get all users (admin only)
    getAllUsers = catchAsync(async (req: AuthRequest, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const filters: any = {};

        if (req.query.role) {
            filters.role = req.query.role;
        }

        const result = await userService.getAllUsers(page, limit, filters);

        return ApiResponse.ok(res, 'Users retrieved successfully', result);
    });

    // Delete current user (soft delete)
    deleteMe = catchAsync(async (req: AuthRequest, res: Response) => {
        await userService.deleteUser(req.user._id.toString());

        return ApiResponse.ok(res, 'User deleted successfully');
    });

    // Update user by ID (admin only)
    updateUserById = catchAsync(async (req: AuthRequest, res: Response) => {
        const user = await userService.updateUserByAdmin(
            req.params.id,
            req.body,
            req.user?.role as string
        );

        if (req.body.roleId) {
            auditLogSafe({
                message: `Role assigned to user ${req.params.id}`,
                type: 'user_role_assigned',
                category: 'settings',
                actorType: 'user',
                actorId: req.user?._id?.toString(),
                targetType: 'user',
                targetId: req.params.id,
                source: 'manual',
                meta: { roleId: req.body.roleId },
            });
        }

        return ApiResponse.ok(res, 'User updated successfully', { user });
    });

    // Delete user by ID (admin only)
    deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
        await userService.deleteUser(req.params.id, req.user?.role as string);

        return ApiResponse.ok(res, 'User deleted successfully');
    });

    // Permanently delete user (admin only)
    permanentlyDeleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
        await userService.permanentlyDeleteUser(req.params.id, req.user?.role as string);

        return ApiResponse.ok(res, 'User permanently deleted');
    });

    // Bulk assign role to users
    bulkAssignRole = catchAsync(async (req: AuthRequest, res: Response) => {
        const { userIds, roleId } = req.body;
        const result = await userService.bulkAssignRole(
            userIds,
            roleId,
            req.user?.role as string
        );

        if (result.updated > 0) {
            auditLogSafe({
                message: `Role assigned to ${result.updated} user(s)`,
                type: 'user_role_assigned',
                category: 'settings',
                actorType: 'user',
                actorId: req.user?._id?.toString(),
                source: 'manual',
                meta: { roleId, userIds, updated: result.updated },
            });
        }

        return ApiResponse.ok(res, 'Role assigned successfully', result);
    });
}

export default new UserController();

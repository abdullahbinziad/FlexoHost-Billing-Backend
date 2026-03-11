import userService from '../user/user.service';
import { IUserCreate, IUserLogin, IAuthTokens } from '../user/user.interface';
import { getOAuthNormalizer } from './strategies';
import type { GoogleProfile } from './types/google.types';
export type { GoogleProfile };

class AuthService {
    register(userData: IUserCreate) {
        return userService.register(userData);
    }

    login(credentials: IUserLogin) {
        return userService.login(credentials);
    }

    refreshToken(refreshToken: string): Promise<IAuthTokens> {
        return userService.refreshToken(refreshToken);
    }

    logout(userId: string): Promise<void> {
        return userService.logout(userId);
    }

    getMe(userId: string) {
        return userService.getUserById(userId);
    }

    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        return userService.changePassword(userId, currentPassword, newPassword);
    }

    forgotPassword(email: string): Promise<string> {
        return userService.forgotPassword(email);
    }

    resetPassword(token: string, newPassword: string): Promise<void> {
        return userService.resetPassword(token, newPassword);
    }

    verifyEmail(token: string): Promise<void> {
        return userService.verifyEmail(token);
    }

    /** Social login – normalizes provider profile and finds/creates user. Scalable for Facebook, GitHub, etc. */
    loginWithOAuth(provider: 'google' | 'facebook' | 'github', rawProfile: unknown): Promise<{ user: any; tokens: IAuthTokens }> {
        const normalizer = getOAuthNormalizer(provider);
        if (!normalizer) throw new Error(`Unsupported OAuth provider: ${provider}`);
        const profile = normalizer(rawProfile);
        return userService.findOrCreateFromOAuth(profile);
    }

    loginWithGoogle(profile: GoogleProfile): Promise<{ user: any; tokens: IAuthTokens }> {
        return this.loginWithOAuth('google', profile);
    }
}

export default new AuthService();

import userService from '../user/user.service';
import { IUserCreate, IUserLogin, IAuthTokens } from '../user/user.interface';

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
}

export default new AuthService();

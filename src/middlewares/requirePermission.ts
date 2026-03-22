import { Response, NextFunction } from 'express';
import ApiError from '../utils/apiError';
import { AuthRequest } from './auth';
import Role from '../modules/role/role.model';
import { hasPermission } from '../modules/role/permission.const';

/**
 * Staff must have at least one of the listed permissions. Admin/superadmin bypass.
 */
export const requireAnyPermission = (permissions: string[]) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        void res;
        const user = req.user;
        if (!user) {
            throw ApiError.unauthorized('You are not logged in.');
        }

        if (user.role === 'superadmin' || user.role === 'admin') {
            return next();
        }

        if (user.roleId) {
            const role = await Role.findById(user.roleId).lean();
            if (role) {
                if (role.hasFullAccess) {
                    return next();
                }
                const ok = permissions.some((p) => hasPermission(role.permissions || [], p));
                if (ok) {
                    return next();
                }
            }
        }

        throw ApiError.forbidden('You do not have permission to perform this action.');
    };
};

/**
 * Middleware that requires the user to have a specific permission.
 * Superadmin and admin bypass (full access).
 * Staff users must have the permission via their role (roleId -> Role.permissions).
 * Supports resource:full (e.g. servers:full grants all servers:*).
 */
export const requirePermission = (permission: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        void res;
        const user = req.user;
        if (!user) {
            throw ApiError.unauthorized('You are not logged in.');
        }

        if (user.role === 'superadmin' || user.role === 'admin') {
            return next();
        }

        if (user.roleId) {
            const role = await Role.findById(user.roleId).lean();
            if (role) {
                if (role.hasFullAccess) {
                    return next();
                }
                if (hasPermission(role.permissions || [], permission)) {
                    return next();
                }
            }
        } else if (user.role === 'staff') {
            // Staff without roleId (pre-migration): no permissions, deny
        }

        throw ApiError.forbidden('You do not have permission to perform this action.');
    };
};

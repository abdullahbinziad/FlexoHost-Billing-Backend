import type { Types } from 'mongoose';
import User from '../user/user.model';
import Role from '../role/role.model';
import { hasPermission } from '../role/permission.const';

const ADMIN_ROLE_NAMES = ['superadmin', 'admin', 'staff'] as const;

export interface AdminAlertRecipient {
    userId: Types.ObjectId;
    email: string;
    role: string;
    roleId?: Types.ObjectId;
}

class AdminAlertRecipientService {
    async resolveByPermission(permission: string): Promise<AdminAlertRecipient[]> {
        const users = await User.find({
            role: { $in: ADMIN_ROLE_NAMES },
            active: true,
        })
            .select('_id email role roleId')
            .lean()
            .exec();

        if (users.length === 0) return [];

        const roleIds = Array.from(new Set(users.map((user: any) => user.roleId?.toString?.()).filter(Boolean)));
        const roles = roleIds.length > 0
            ? await Role.find({ _id: { $in: roleIds }, archived: { $ne: true } })
                .select('_id permissions hasFullAccess slug')
                .lean()
                .exec()
            : [];
        const roleById = new Map(roles.map((role: any) => [role._id.toString(), role]));
        const byEmail = new Map<string, AdminAlertRecipient>();

        for (const user of users as any[]) {
            const email = String(user.email || '').trim().toLowerCase();
            if (!email) continue;

            const role = user.roleId ? roleById.get(user.roleId.toString()) : null;
            const allowed = this.isAllowed({
                baseRole: user.role,
                role,
                permission,
            });
            if (!allowed || byEmail.has(email)) continue;

            byEmail.set(email, {
                userId: user._id,
                email,
                role: user.role,
                roleId: user.roleId,
            });
        }

        return Array.from(byEmail.values());
    }

    private isAllowed(input: { baseRole: string; role: any; permission: string }): boolean {
        const { baseRole, role, permission } = input;

        if (role?.hasFullAccess) return true;
        if (role?.permissions && hasPermission(role.permissions, permission)) return true;

        // Keep superadmin as the built-in break-glass recipient when no role record is assigned.
        return baseRole === 'superadmin' && !role;
    }
}

export const adminAlertRecipientService = new AdminAlertRecipientService();

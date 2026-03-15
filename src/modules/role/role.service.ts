import mongoose from 'mongoose';
import Role from './role.model';
import { escapeRegex } from '../../utils/escapeRegex';
import User from '../user/user.model';
import type { IRoleDocument, IRoleCreate, IRoleUpdate } from './role.interface';
import ApiError from '../../utils/apiError';
import { isValidPermission, PERMISSION_META } from './permission.const';
import { ROLE_PRESETS } from './role.const';

const SUPER_ADMIN_SLUG = 'super_admin';
const ADMIN_SLUG = 'admin';

class RoleService {
    async create(data: IRoleCreate): Promise<IRoleDocument> {
        const permissions = this.validatePermissions(data.permissions || []);
        const slug =
            data.slug ||
            (data.name || '')
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/g, '');

        const existing = await Role.findOne({ slug, archived: { $ne: true } });
        if (existing) {
            throw ApiError.conflict('A role with this slug already exists');
        }

        const role = await Role.create({
            name: data.name,
            slug,
            permissions,
            description: data.description,
            isSystem: data.isSystem ?? false,
            hasFullAccess: data.hasFullAccess ?? false,
        });
        return role;
    }

    async getAll(filter: {
        includeArchived?: boolean;
        page?: number;
        limit?: number;
        search?: string;
    } = {}) {
        const { includeArchived = false, page = 1, limit = 50, search } = filter;
        const query: Record<string, unknown> = {};
        if (!includeArchived) {
            query.archived = { $ne: true };
        }
        if (search && search.trim()) {
            const escaped = escapeRegex(search.trim());
            query.$or = [
                { name: { $regex: escaped, $options: 'i' } },
                { slug: { $regex: escaped, $options: 'i' } },
            ];
        }

        const [roles, total] = await Promise.all([
            Role.find(query).sort({ isSystem: -1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
            Role.countDocuments(query),
        ]);

        const rolesWithUserCount = await Promise.all(
            roles.map(async (r: any) => {
                const userCount = await User.countDocuments({ roleId: r._id });
                return { ...r, userCount };
            })
        );

        return {
            roles: rolesWithUserCount,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit,
            },
        };
    }

    async getById(id: string): Promise<IRoleDocument> {
        if (!mongoose.isValidObjectId(id)) {
            throw ApiError.badRequest('Invalid role ID');
        }
        const role = await Role.findById(id);
        if (!role) {
            throw ApiError.notFound('Role not found');
        }
        return role;
    }

    async update(id: string, data: IRoleUpdate): Promise<IRoleDocument> {
        const role = await this.getById(id);
        if (role.isSystem) {
            if (data.permissions !== undefined) {
                const permissions = this.validatePermissions(data.permissions);
                role.permissions = permissions;
            }
            if (data.description !== undefined) role.description = data.description;
            if (data.name !== undefined && role.slug !== SUPER_ADMIN_SLUG && role.slug !== ADMIN_SLUG) {
                role.name = data.name;
            }
        } else {
            if (data.name !== undefined) role.name = data.name;
            if (data.description !== undefined) role.description = data.description;
            if (data.permissions !== undefined) {
                role.permissions = this.validatePermissions(data.permissions);
            }
        }
        await role.save();
        return role;
    }

    async delete(id: string): Promise<void> {
        const role = await this.getById(id);
        if (role.isSystem) {
            throw ApiError.forbidden('Cannot delete system role');
        }
        if (role.archived) {
            throw ApiError.badRequest('Role is already archived');
        }
        const userCount = await User.countDocuments({ roleId: id });
        if (userCount > 0) {
            throw ApiError.badRequest('Cannot delete role: users are assigned to it. Reassign or archive first.');
        }
        await Role.findByIdAndDelete(id);
    }

    async archive(id: string, archivedBy: string): Promise<IRoleDocument> {
        const role = await this.getById(id);
        if (role.isSystem) {
            throw ApiError.forbidden('Cannot archive system role');
        }
        if (role.archived) {
            throw ApiError.badRequest('Role is already archived');
        }
        role.archived = true;
        role.archivedAt = new Date();
        role.archivedBy = new mongoose.Types.ObjectId(archivedBy);
        await role.save();
        return role;
    }

    async restore(id: string): Promise<IRoleDocument> {
        const role = await this.getById(id);
        if (!role.archived) {
            throw ApiError.badRequest('Role is not archived');
        }
        role.archived = false;
        role.archivedAt = undefined;
        role.archivedBy = undefined;
        await role.save();
        return role;
    }

    async duplicate(id: string): Promise<IRoleDocument> {
        const source = await this.getById(id);
        const newRole = await Role.create({
            name: `Copy of ${source.name}`,
            slug: `${source.slug}_copy_${Date.now().toString(36)}`,
            permissions: [...source.permissions],
            description: source.description,
            isSystem: false,
            hasFullAccess: false,
        });
        return newRole;
    }

    getPresets() {
        return ROLE_PRESETS;
    }

    getPermissions() {
        return PERMISSION_META;
    }

    async compare(id1: string, id2: string) {
        const [role1, role2] = await Promise.all([this.getById(id1), this.getById(id2)]);
        const perms1 = new Set(role1.permissions);
        const perms2 = new Set(role2.permissions);
        const onlyIn1 = role1.permissions.filter((p) => !perms2.has(p));
        const onlyIn2 = role2.permissions.filter((p) => !perms1.has(p));
        const both = role1.permissions.filter((p) => perms2.has(p));
        return {
            role1: role1.toObject(),
            role2: role2.toObject(),
            diff: { onlyInRole1: onlyIn1, onlyInRole2: onlyIn2, inBoth: both },
        };
    }

    async exportRole(id: string) {
        const role = await this.getById(id);
        return {
            name: role.name,
            slug: role.slug,
            permissions: role.permissions,
            description: role.description,
        };
    }

    async importRole(data: { name: string; slug?: string; permissions: string[]; description?: string }) {
        const permissions = this.validatePermissions(data.permissions || []);
        const slug =
            data.slug ||
            (data.name || '')
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/g, '');

        const existing = await Role.findOne({ slug, archived: { $ne: true } });
        if (existing) {
            const uniqueSlug = `${slug}_imported_${Date.now().toString(36)}`;
            return this.create({
                name: data.name,
                slug: uniqueSlug,
                permissions,
                description: data.description,
            });
        }
        return this.create({
            name: data.name,
            slug,
            permissions,
            description: data.description,
        });
    }

    private validatePermissions(permissions: string[]): string[] {
        const valid = permissions.filter((p) => isValidPermission(p));
        return [...new Set(valid)];
    }

    async getRoleBySlug(slug: string): Promise<IRoleDocument | null> {
        return Role.findOne({ slug, archived: { $ne: true } });
    }

    async getSuperAdminRole(): Promise<IRoleDocument | null> {
        return this.getRoleBySlug(SUPER_ADMIN_SLUG);
    }

    async getAdminRole(): Promise<IRoleDocument | null> {
        return this.getRoleBySlug(ADMIN_SLUG);
    }
}

export const roleService = new RoleService();

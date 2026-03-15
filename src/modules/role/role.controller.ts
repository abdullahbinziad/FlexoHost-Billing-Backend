import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import { roleService } from './role.service';
import { auditLogSafe } from '../activity-log/activity-log.service';

class RoleController {
    create = catchAsync(async (req: AuthRequest, res: Response) => {
        const role = await roleService.create(req.body);
        auditLogSafe({
            message: `Role "${role.name}" created`,
            type: 'role_created',
            category: 'settings',
            actorType: 'user',
            actorId: req.user?._id?.toString(),
            targetType: 'role',
            targetId: role._id.toString(),
            source: 'manual',
        });
        return ApiResponse.created(res, 'Role created successfully', role);
    });

    getAll = catchAsync(async (req: AuthRequest, res: Response) => {
        const { page, limit, includeArchived, search } = req.query;
        const result = await roleService.getAll({
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            includeArchived: includeArchived === 'true',
            search: search as string,
        });
        return ApiResponse.ok(res, 'Roles retrieved successfully', result);
    });

    getById = catchAsync(async (req: AuthRequest, res: Response) => {
        const role = await roleService.getById(req.params.id);
        return ApiResponse.ok(res, 'Role retrieved successfully', role);
    });

    update = catchAsync(async (req: AuthRequest, res: Response) => {
        const role = await roleService.update(req.params.id, req.body);
        auditLogSafe({
            message: `Role "${role.name}" updated`,
            type: 'role_updated',
            category: 'settings',
            actorType: 'user',
            actorId: req.user?._id?.toString(),
            targetType: 'role',
            targetId: role._id.toString(),
            source: 'manual',
        });
        return ApiResponse.ok(res, 'Role updated successfully', role);
    });

    delete = catchAsync(async (req: AuthRequest, res: Response) => {
        const role = await roleService.getById(req.params.id);
        await roleService.delete(req.params.id);
        auditLogSafe({
            message: `Role "${role.name}" deleted`,
            type: 'role_deleted',
            category: 'settings',
            actorType: 'user',
            actorId: req.user?._id?.toString(),
            targetType: 'role',
            targetId: req.params.id,
            source: 'manual',
        });
        return ApiResponse.ok(res, 'Role deleted successfully');
    });

    archive = catchAsync(async (req: AuthRequest, res: Response) => {
        const userId = req.user?._id?.toString();
        if (!userId) throw new Error('User not found');
        const role = await roleService.archive(req.params.id, userId);
        auditLogSafe({
            message: `Role "${role.name}" archived`,
            type: 'role_archived',
            category: 'settings',
            actorType: 'user',
            actorId: userId,
            targetType: 'role',
            targetId: role._id.toString(),
            source: 'manual',
        });
        return ApiResponse.ok(res, 'Role archived successfully', role);
    });

    restore = catchAsync(async (req: AuthRequest, res: Response) => {
        const role = await roleService.restore(req.params.id);
        auditLogSafe({
            message: `Role "${role.name}" restored`,
            type: 'role_restored',
            category: 'settings',
            actorType: 'user',
            actorId: req.user?._id?.toString(),
            targetType: 'role',
            targetId: role._id.toString(),
            source: 'manual',
        });
        return ApiResponse.ok(res, 'Role restored successfully', role);
    });

    duplicate = catchAsync(async (req: AuthRequest, res: Response) => {
        const role = await roleService.duplicate(req.params.id);
        auditLogSafe({
            message: `Role duplicated to "${role.name}"`,
            type: 'role_created',
            category: 'settings',
            actorType: 'user',
            actorId: req.user?._id?.toString(),
            targetType: 'role',
            targetId: role._id.toString(),
            source: 'manual',
        });
        return ApiResponse.created(res, 'Role duplicated successfully', role);
    });

    getPresets = catchAsync(async (_req: AuthRequest, res: Response) => {
        const presets = roleService.getPresets();
        return ApiResponse.ok(res, 'Presets retrieved successfully', presets);
    });

    getPermissions = catchAsync(async (_req: AuthRequest, res: Response) => {
        const permissions = roleService.getPermissions();
        return ApiResponse.ok(res, 'Permissions retrieved successfully', permissions);
    });

    compare = catchAsync(async (req: AuthRequest, res: Response) => {
        const { id1, id2 } = req.query;
        const result = await roleService.compare(id1 as string, id2 as string);
        return ApiResponse.ok(res, 'Roles compared successfully', result);
    });

    exportRole = catchAsync(async (req: AuthRequest, res: Response) => {
        const data = await roleService.exportRole(req.params.id);
        return ApiResponse.ok(res, 'Role exported successfully', data);
    });

    importRole = catchAsync(async (req: AuthRequest, res: Response) => {
        const role = await roleService.importRole(req.body);
        auditLogSafe({
            message: `Role "${role.name}" imported`,
            type: 'role_created',
            category: 'settings',
            actorType: 'user',
            actorId: req.user?._id?.toString(),
            targetType: 'role',
            targetId: role._id.toString(),
            source: 'manual',
        });
        return ApiResponse.created(res, 'Role imported successfully', role);
    });
}

export const roleController = new RoleController();

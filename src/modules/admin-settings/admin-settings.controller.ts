import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import ApiError from '../../utils/apiError';
import { getBillingSettings, updateBillingSettings } from '../billing-settings/billing-settings.service';
import { AuthRequest } from '../../middlewares/auth';
import { auditLogSafe } from '../activity-log/activity-log.service';
import Role from '../role/role.model';
import { hasPermission } from '../role/permission.const';

async function assertStaffCanPatchSettings(user: AuthRequest['user'], filtered: Record<string, unknown>): Promise<void> {
    const r = user?.role;
    if (r === 'superadmin' || r === 'admin') {
        return;
    }

    if (Object.keys(filtered).length === 0) {
        return;
    }

    if (!user?.roleId) {
        throw ApiError.forbidden('You do not have permission to update settings.');
    }

    const roleDoc = await Role.findById(user.roleId).lean();
    if (!roleDoc) {
        throw ApiError.forbidden('You do not have permission to update settings.');
    }
    if (roleDoc.hasFullAccess) {
        return;
    }

    const perms = roleDoc.permissions || [];
    if (!hasPermission(perms, 'settings:update_billing')) {
        throw ApiError.forbidden('Missing permission: settings:update_billing');
    }
}

export const getSettings = catchAsync(async (_req: Request, res: Response) => {
    const billing = await getBillingSettings();
    return ApiResponse.ok(res, 'Settings retrieved', { billing });
});

export const updateBillingSettingsHandler = catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user!;
    const updates = req.body;

    const allowed = [
        'defaultStaffRoleId',
        'renewalLeadDays',
        'daysBeforeSuspend',
        'daysBeforeTermination',
        'invoiceDueDays',
        'overdueExtraChargeDays',
        'overdueExtraChargeAmount',
        'overdueExtraChargeType',
        'reminderPreDays',
        'reminderOverdue1Days',
        'reminderOverdue2Days',
        'reminderOverdue3Days',
        'preReminderDays',
        'overdueReminderDays',
        'suspendWarningDays',
        'terminationWarningDays',
        'domainExpiryReminderDays',
        'reminderDueTodayEnabled',
    ];
    const filtered: Record<string, unknown> = {};
    for (const k of allowed) {
        if (updates[k] !== undefined) filtered[k] = updates[k];
    }

    await assertStaffCanPatchSettings(user, filtered);

    const billing = await updateBillingSettings(filtered as any, user._id?.toString());

    auditLogSafe({
        message: 'Billing settings updated',
        type: 'settings_changed',
        category: 'settings',
        actorType: 'user',
        actorId: user._id?.toString(),
        source: 'manual',
        meta: { updatedKeys: Object.keys(filtered) } as Record<string, unknown>,
    });

    return ApiResponse.ok(res, 'Billing settings updated', { billing });
});

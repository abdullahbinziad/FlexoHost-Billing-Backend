import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import { getBillingSettings, updateBillingSettings } from './billing-settings.service';
import { AuthRequest } from '../../middlewares/auth';
import { auditLogSafe } from '../activity-log/activity-log.service';
import { setRuntimeBdtRateToBase } from '../exchange-rate/runtime-fx-rate.service';

export const getSettings = catchAsync(async (_req: Request, res: Response) => {
    const billing = await getBillingSettings();
    return ApiResponse.ok(res, 'Settings retrieved', { billing });
});

export const updateBillingSettingsHandler = catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user!;
    const updates = req.body;

    const allowed = [
        'defaultStaffRoleId',
        'exchangeRateBdt',
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

    const billing = await updateBillingSettings(filtered as any, user._id?.toString());
    setRuntimeBdtRateToBase(billing.exchangeRateBdt);

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

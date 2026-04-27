import BillingSettings, { DEFAULT_BILLING_SETTINGS } from './billing-settings.model';

export interface BillingSettingsDto {
    defaultStaffRoleId?: string | null;
    exchangeRateBdt: number;
    renewalLeadDays: number;
    daysBeforeSuspend: number;
    daysBeforeTermination: number;
    invoiceDueDays: number;
    overdueExtraChargeDays: number;
    overdueExtraChargeAmount: number;
    overdueExtraChargeType: 'fixed' | 'percent';
    reminderPreDays: number;
    reminderOverdue1Days: number;
    reminderOverdue2Days: number;
    reminderOverdue3Days: number;
    preReminderDays: number[];
    overdueReminderDays: number[];
    suspendWarningDays: number[];
    terminationWarningDays: number[];
    domainExpiryReminderDays: number[];
    reminderDueTodayEnabled: boolean;
}

const SETTINGS_KEY = 'global';

async function getOrCreate(): Promise<Record<string, unknown>> {
    let doc = await BillingSettings.findOne({ key: SETTINGS_KEY }).lean().exec() as Record<string, unknown> | null;
    if (!doc) {
        const created = await BillingSettings.create({
            key: SETTINGS_KEY,
            ...DEFAULT_BILLING_SETTINGS,
        });
        doc = created.toObject() as unknown as Record<string, unknown>;
    }
    return doc;
}

export async function getBillingSettings(): Promise<BillingSettingsDto> {
    const doc = await getOrCreate();
    const preArr = (doc.preReminderDays as number[] | undefined) ?? [];
    const overdueArr = (doc.overdueReminderDays as number[] | undefined) ?? [];
    const suspendWarn = (doc.suspendWarningDays as number[] | undefined) ?? DEFAULT_BILLING_SETTINGS.suspendWarningDays;
    const termWarn = (doc.terminationWarningDays as number[] | undefined) ?? DEFAULT_BILLING_SETTINGS.terminationWarningDays;
    const domainExpiry = (doc.domainExpiryReminderDays as number[] | undefined) ?? DEFAULT_BILLING_SETTINGS.domainExpiryReminderDays;
    const raw = doc.defaultStaffRoleId;
    const defaultStaffRoleId = raw ? String(raw) : null;
    return {
        defaultStaffRoleId,
        exchangeRateBdt: (doc.exchangeRateBdt as number | undefined) ?? DEFAULT_BILLING_SETTINGS.exchangeRateBdt,
        renewalLeadDays: (doc.renewalLeadDays as number | undefined) ?? DEFAULT_BILLING_SETTINGS.renewalLeadDays,
        daysBeforeSuspend: (doc.daysBeforeSuspend as number | undefined) ?? DEFAULT_BILLING_SETTINGS.daysBeforeSuspend,
        daysBeforeTermination: (doc.daysBeforeTermination as number | undefined) ?? DEFAULT_BILLING_SETTINGS.daysBeforeTermination,
        invoiceDueDays: (doc.invoiceDueDays as number | undefined) ?? DEFAULT_BILLING_SETTINGS.invoiceDueDays,
        overdueExtraChargeDays: (doc.overdueExtraChargeDays as number | undefined) ?? DEFAULT_BILLING_SETTINGS.overdueExtraChargeDays,
        overdueExtraChargeAmount: (doc.overdueExtraChargeAmount as number | undefined) ?? DEFAULT_BILLING_SETTINGS.overdueExtraChargeAmount,
        overdueExtraChargeType: ((doc.overdueExtraChargeType as string | undefined) ?? DEFAULT_BILLING_SETTINGS.overdueExtraChargeType) as 'fixed' | 'percent',
        reminderPreDays: (doc.reminderPreDays as number | undefined) ?? DEFAULT_BILLING_SETTINGS.reminderPreDays,
        reminderOverdue1Days: (doc.reminderOverdue1Days as number | undefined) ?? DEFAULT_BILLING_SETTINGS.reminderOverdue1Days,
        reminderOverdue2Days: (doc.reminderOverdue2Days as number | undefined) ?? DEFAULT_BILLING_SETTINGS.reminderOverdue2Days,
        reminderOverdue3Days: (doc.reminderOverdue3Days as number | undefined) ?? DEFAULT_BILLING_SETTINGS.reminderOverdue3Days,
        preReminderDays: preArr.length > 0 ? preArr : [(doc.reminderPreDays as number | undefined) ?? 7],
        overdueReminderDays: overdueArr.length > 0 ? overdueArr : [(doc.reminderOverdue1Days as number | undefined) ?? 3, (doc.reminderOverdue2Days as number | undefined) ?? 7, (doc.reminderOverdue3Days as number | undefined) ?? 14].filter((d: number) => d > 0),
        suspendWarningDays: Array.isArray(suspendWarn) ? suspendWarn.filter((d: number) => d > 0) : [],
        terminationWarningDays: Array.isArray(termWarn) ? termWarn.filter((d: number) => d > 0) : [],
        domainExpiryReminderDays: Array.isArray(domainExpiry) ? domainExpiry.filter((d: number) => d > 0) : [],
        reminderDueTodayEnabled: (doc.reminderDueTodayEnabled as boolean | undefined) ?? DEFAULT_BILLING_SETTINGS.reminderDueTodayEnabled,
    };
}

export async function updateBillingSettings(
    updates: Partial<BillingSettingsDto & { defaultStaffRoleId?: string | null }>,
    updatedBy?: string
): Promise<BillingSettingsDto> {
    const doc = await BillingSettings.findOneAndUpdate(
        { key: SETTINGS_KEY },
        {
            $set: {
                ...updates,
                ...(updatedBy && { updatedBy }),
            },
            $setOnInsert: { key: SETTINGS_KEY, ...DEFAULT_BILLING_SETTINGS },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();

    if (!doc) {
        void getOrCreate();
        return getBillingSettings();
    }

    return getBillingSettings();
}

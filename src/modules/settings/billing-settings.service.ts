import BillingSettings, { DEFAULT_BILLING_SETTINGS } from './billing-settings.model';
import { encryptSmtpPasswordForStorage } from '../smtp';

export interface BillingSettingsDto {
    defaultStaffRoleId?: string | null;
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
    smtpUseCustom: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    /** True if a password is stored in the database (value is never returned). */
    smtpPasswordIsSet: boolean;
    smtpSecure: boolean;
    smtpRequireTls: boolean;
    smtpTlsRejectUnauthorized: boolean;
    emailFrom: string;
}

const SETTINGS_KEY = 'global';

async function getOrCreate(): Promise<Record<string, unknown>> {
    let doc = (await BillingSettings.findOne({ key: SETTINGS_KEY })
        .select('+smtpPassword')
        .lean()
        .exec()) as Record<string, unknown> | null;
    if (!doc) {
        const created = await BillingSettings.create({
            key: SETTINGS_KEY,
            ...DEFAULT_BILLING_SETTINGS,
        });
        doc = created.toObject() as unknown as Record<string, unknown>;
        (doc as { smtpPassword?: string }).smtpPassword = '';
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
        smtpUseCustom: (doc.smtpUseCustom as boolean | undefined) ?? DEFAULT_BILLING_SETTINGS.smtpUseCustom,
        smtpHost: (doc.smtpHost as string | undefined) ?? DEFAULT_BILLING_SETTINGS.smtpHost,
        smtpPort: (doc.smtpPort as number | undefined) ?? DEFAULT_BILLING_SETTINGS.smtpPort,
        smtpUser: (doc.smtpUser as string | undefined) ?? DEFAULT_BILLING_SETTINGS.smtpUser,
        smtpPasswordIsSet: !!(doc.smtpPassword && String(doc.smtpPassword).trim()),
        smtpSecure: (doc.smtpSecure as boolean | undefined) ?? DEFAULT_BILLING_SETTINGS.smtpSecure,
        smtpRequireTls: (doc.smtpRequireTls as boolean | undefined) ?? DEFAULT_BILLING_SETTINGS.smtpRequireTls,
        smtpTlsRejectUnauthorized:
            (doc.smtpTlsRejectUnauthorized as boolean | undefined) ?? DEFAULT_BILLING_SETTINGS.smtpTlsRejectUnauthorized,
        emailFrom: (doc.emailFrom as string | undefined) ?? DEFAULT_BILLING_SETTINGS.emailFrom,
    };
}

export async function updateBillingSettings(
    updates: Partial<BillingSettingsDto & { defaultStaffRoleId?: string | null; smtpPassword?: string | null }>,
    updatedBy?: string
): Promise<BillingSettingsDto> {
    const { smtpPassword, smtpPasswordIsSet: _ignoredComputed, ...rest } = updates as Partial<
        BillingSettingsDto & { defaultStaffRoleId?: string | null }
    > & { smtpPassword?: string | null };
    void _ignoredComputed;

    const $set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) {
            $set[k] = v;
        }
    }
    if (updatedBy) {
        $set.updatedBy = updatedBy;
    }

    const $unset: Record<string, 1> = {};
    if (smtpPassword !== undefined) {
        if (smtpPassword === null || smtpPassword === '') {
            $unset.smtpPassword = 1;
        } else {
            $set.smtpPassword = encryptSmtpPasswordForStorage(smtpPassword);
        }
    }

    // Only set `key` on insert. Do not spread DEFAULT_BILLING_SETTINGS here: those paths overlap
    // fields in `$set` (e.g. smtpUseCustom) and MongoDB rejects one path in both $set and $setOnInsert.
    const updatePayload: Record<string, unknown> = {
        $setOnInsert: { key: SETTINGS_KEY },
    };
    if (Object.keys($set).length > 0) {
        updatePayload.$set = $set;
    }
    if (Object.keys($unset).length > 0) {
        updatePayload.$unset = $unset;
    }

    const doc = await BillingSettings.findOneAndUpdate({ key: SETTINGS_KEY }, updatePayload, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
    }).exec();

    if (!doc) {
        void getOrCreate();
        return getBillingSettings();
    }

    return getBillingSettings();
}

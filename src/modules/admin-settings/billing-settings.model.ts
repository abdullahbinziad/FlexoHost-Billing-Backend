import mongoose, { Schema, Document } from 'mongoose';

export interface IBillingSettings extends Document {
    key?: string;
    /** Days before service nextDueDate to create renewal invoice (default: 7) */
    renewalLeadDays: number;
    /** Days overdue before suspending service (cPanel) - grace period (default: 5) */
    daysBeforeSuspend: number;
    /** Days suspended before terminating service (default: 30) */
    daysBeforeTermination: number;
    /** Days from order creation to invoice due date (default: 7) */
    invoiceDueDays: number;
    /** Days overdue before applying late fee / extra charge (0 = disabled) (default: 0) */
    overdueExtraChargeDays: number;
    /** Late fee amount (fixed) or percentage - 0 = no fee (default: 0) */
    overdueExtraChargeAmount: number;
    /** 'fixed' | 'percent' - type of late fee (default: 'fixed') */
    overdueExtraChargeType: 'fixed' | 'percent';
    /** @deprecated Use preReminderDays. Pre-reminder: days before due (default: 7) */
    reminderPreDays: number;
    /** @deprecated Use overdueReminderDays. Overdue reminder 1 (default: 3) */
    reminderOverdue1Days: number;
    /** @deprecated Use overdueReminderDays. Overdue reminder 2 (default: 7) */
    reminderOverdue2Days: number;
    /** @deprecated Use overdueReminderDays. Overdue reminder 3 (default: 14) */
    reminderOverdue3Days: number;
    /** Flexible: days before due date to send reminders (e.g. [30, 14, 7, 3, 1]). 0 = disabled. */
    preReminderDays: number[];
    /** Flexible: days overdue to send reminders (e.g. [1, 3, 7, 14, 30]). 0 = disabled. */
    overdueReminderDays: number[];
    /** Days before suspension to send warning (e.g. [3, 1]). Uses daysBeforeSuspend - X. */
    suspendWarningDays: number[];
    /** Days before termination to send warning for suspended services (e.g. [7, 3, 1]). */
    terminationWarningDays: number[];
    /** Days before domain expiry to send renewal reminders (e.g. [90, 60, 30, 14, 7]). */
    domainExpiryReminderDays: number[];
    /** Send "due today" reminder when diffDays === 0 (default: true) */
    reminderDueTodayEnabled: boolean;
    /** Default role for new staff users (ObjectId ref Role). When creating/assigning staff, auto-assign if no role selected. */
    defaultStaffRoleId?: mongoose.Types.ObjectId;
    /** 1 BDT = exchangeRateBdt in base reporting currency (default base: USD). */
    exchangeRateBdt: number;
    updatedAt: Date;
    updatedBy?: mongoose.Types.ObjectId;
}

const billingSettingsSchema = new Schema<IBillingSettings>(
    {
        key: { type: String, default: 'global', unique: true },
        renewalLeadDays: { type: Number, default: 7, min: 1, max: 90 },
        daysBeforeSuspend: { type: Number, default: 5, min: 0, max: 90 },
        daysBeforeTermination: { type: Number, default: 30, min: 1, max: 365 },
        invoiceDueDays: { type: Number, default: 7, min: 1, max: 90 },
        overdueExtraChargeDays: { type: Number, default: 0, min: 0, max: 90 },
        overdueExtraChargeAmount: { type: Number, default: 0, min: 0 },
        overdueExtraChargeType: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
        reminderPreDays: { type: Number, default: 7, min: 0, max: 30 },
        reminderOverdue1Days: { type: Number, default: 3, min: 0, max: 30 },
        reminderOverdue2Days: { type: Number, default: 7, min: 0, max: 60 },
        reminderOverdue3Days: { type: Number, default: 14, min: 0, max: 90 },
        preReminderDays: { type: [Number], default: [30, 14, 7, 3, 1] },
        overdueReminderDays: { type: [Number], default: [1, 3, 7, 14, 30] },
        suspendWarningDays: { type: [Number], default: [3, 1] },
        terminationWarningDays: { type: [Number], default: [7, 3, 1] },
        domainExpiryReminderDays: { type: [Number], default: [90, 60, 30, 14, 7] },
        reminderDueTodayEnabled: { type: Boolean, default: true },
        defaultStaffRoleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null },
        exchangeRateBdt: { type: Number, default: 0.009, min: 0.000001 },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

export const DEFAULT_BILLING_SETTINGS = {
    renewalLeadDays: 7,
    daysBeforeSuspend: 5,
    daysBeforeTermination: 30,
    invoiceDueDays: 7,
    overdueExtraChargeDays: 0,
    overdueExtraChargeAmount: 0,
    overdueExtraChargeType: 'fixed',
    reminderPreDays: 7,
    reminderOverdue1Days: 3,
    reminderOverdue2Days: 7,
    reminderOverdue3Days: 14,
    preReminderDays: [30, 14, 7, 3, 1],
    overdueReminderDays: [1, 3, 7, 14, 30],
    suspendWarningDays: [3, 1],
    terminationWarningDays: [7, 3, 1],
    domainExpiryReminderDays: [90, 60, 30, 14, 7],
    reminderDueTodayEnabled: true,
    exchangeRateBdt: 0.009,
};

export default mongoose.model<IBillingSettings>('BillingSettings', billingSettingsSchema);

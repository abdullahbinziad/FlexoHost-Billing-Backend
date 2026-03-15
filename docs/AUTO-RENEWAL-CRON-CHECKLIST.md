# Web Hosting Billing System – Auto-Renewal, Cron & Dynamic Interactivity Checklist

**Audit Date:** March 2025  
**Role:** Software QA / Tester

---

## 1. MUST-HAVE CHECKLIST (Web Hosting Billing)

### 1.1 Auto-Renewal System

| # | Item | Expected | Status |
|---|------|----------|--------|
| 1 | Generate renewal invoices for recurring services | Cron finds services with `nextDueDate <= today + renewalLeadDays`, creates invoice | ✅ Ready |
| 2 | Idempotency – no duplicate renewal invoices | RenewalLedger prevents same service+dueDate invoiced twice | ✅ Ready |
| 3 | Group renewals by client (one invoice per client) | Multiple services → single invoice with line items | ✅ Ready |
| 4 | Link invoice items to services (`meta.serviceId`) | For suspension, unsuspend, nextDueDate advance | ✅ Ready |
| 5 | Advance `nextDueDate` after payment | `applyRenewalPayment()` in service-lifecycle | ✅ Ready |
| 6 | Skip one-time billing services | `billingCycle !== ONE_TIME` | ✅ Ready |
| 7 | Respect `autoRenew` flag | Only services with `autoRenew: true` | ✅ Ready |
| 8 | **Send email when renewal invoice created** | Client notified of new renewal invoice | ❌ **NOT READY** |

### 1.2 Overdue & Suspension

| # | Item | Expected | Status |
|---|------|----------|--------|
| 9 | Mark overdue invoices (UNPAID → OVERDUE) | Invoice reminder marks `dueDate < today` | ✅ Ready |
| 10 | Grace period before suspend | `daysBeforeSuspend` (default 5) | ✅ Ready |
| 11 | Suspend services linked to overdue invoices | Finds `meta.serviceId`, sets SUSPENDED, creates ServiceActionJob | ✅ Ready |
| 12 | Execute SUSPEND on provider (WHM, VPS) | Action worker calls provider | ✅ Ready |
| 13 | Send email when service suspended | `service.suspended` template | ✅ Ready |
| 14 | Unsuspend on payment | `onInvoicePaidUnsuspend()` queues UNSUSPEND | ✅ Ready |

### 1.3 Termination

| # | Item | Expected | Status |
|---|------|----------|--------|
| 15 | Terminate suspended services past threshold | `daysBeforeTermination` (default 30) | ✅ Ready |
| 16 | Execute TERMINATE on provider | Action worker | ✅ Ready |
| 17 | **Send termination warning emails** | X days before termination (e.g. 7, 3, 1) | ❌ **NOT READY** |
| 18 | **Send email when service terminated** | Client notified service is gone | ❌ **NOT READY** |

### 1.4 Invoice Reminders

| # | Item | Expected | Status |
|---|------|----------|--------|
| 19 | Pre-due reminders | `preReminderDays` [30, 14, 7, 3, 1] | ✅ Ready |
| 20 | Due today reminder | `reminderDueTodayEnabled` | ✅ Ready |
| 21 | Overdue reminders | `overdueReminderDays` [1, 3, 7, 14, 30] | ✅ Ready |
| 22 | Suspension warning | `suspendWarningDays` before suspend | ✅ Ready |
| 23 | Idempotency (once per type per invoice) | InvoiceReminderLog | ✅ Ready |

### 1.5 Late Fee / Overdue Extra Charge

| # | Item | Expected | Status |
|---|------|----------|--------|
| 24 | Apply late fee after X days overdue | Add line item or adjust balance | ❌ **NOT READY** |
| 25 | Config: overdueExtraChargeDays, Amount, Type | Settings exist, UI exists | ⚠️ Settings only |

### 1.6 Domain

| # | Item | Expected | Status |
|---|------|----------|--------|
| 26 | Domain renewal reminders | `domainExpiryReminderDays` [90, 60, 30, 14, 7] | ✅ Ready |
| 27 | Domain expired notice | When `expiresAt < today` | ✅ Ready |
| 28 | Domain transfer sync | PENDING → completed/rejected | ✅ Ready |
| 29 | Domain expiry sync from registrar | Update expiresAt, detect drift | ✅ Ready |

### 1.7 Provisioning

| # | Item | Expected | Status |
|---|------|----------|--------|
| 30 | Create provisioning jobs on invoice paid | handleInvoicePaid | ✅ Ready |
| 31 | Process provisioning queue | Hosting, Domain, VPS providers | ✅ Ready |
| 32 | Send hosting account created email | With credentials | ✅ Ready |
| 33 | Send domain registration confirmation | After domain provisioned | ✅ Ready |

### 1.8 Cron / Scheduler

| # | Item | Expected | Status |
|---|------|----------|--------|
| 34 | Scheduler starts on server boot | automationScheduler.start() in server.ts | ✅ Ready |
| 35 | Configurable intervals (env) | CRON_*_INTERVAL_MS | ✅ Ready |
| 36 | Optional run-on-start | CRON_RUN_ON_START | ✅ Ready |
| 37 | Overlap prevention | runningTasks Set | ✅ Ready |
| 38 | Distributed lock (optional) | automationTaskLockService | ✅ Ready |
| 39 | Audit log (start/complete/fail) | auditLogSafe | ✅ Ready |
| 40 | Failure alerts | automationAlertService | ✅ Ready |
| 41 | Digest email | automationDigestService | ✅ Ready |

### 1.9 Usage Sync

| # | Item | Expected | Status |
|---|------|----------|--------|
| 42 | Fetch disk/bandwidth from WHM | usageSyncScheduler | ✅ Ready |
| 43 | Update HostingServiceDetails.usageSnapshot | Yes | ✅ Ready |

### 1.10 Billing Settings

| # | Item | Expected | Status |
|---|------|----------|--------|
| 44 | Default settings on first use | getOrCreate creates doc | ✅ Ready |
| 45 | Admin UI to edit settings | Settings page | ✅ Ready |
| 46 | renewalLeadDays, daysBeforeSuspend, etc. | All configurable | ✅ Ready |

---

## 2. GAPS – NOT READY PROPERLY

| Priority | Gap | Location | Impact |
|----------|-----|----------|--------|
| **High** | Renewal invoice created – no email sent | `service-renewal.scheduler.ts` | Client is not notified when auto-renewal invoice is generated. |
| **High** | Late fee never applied | Invoice service | `overdueExtraChargeDays` > 0 has no effect. Dashboard shows "Not instrumented yet". |
| **Medium** | Termination warning emails not sent | Missing | `terminationWarningDays` [7, 3, 1] exist in settings but no code sends emails. |
| **Medium** | Service terminated – no email | `service-termination.scheduler.ts` | Client is not notified when service is terminated. |
| **Low** | Domain renewal reminder – renewalPrice = 0 | `domain-expiry-reminder.scheduler.ts` | Email shows "0" instead of actual TLD price. |

---

## 3. SUMMARY

| Category | Ready | Not Ready |
|----------|-------|-----------|
| Auto-Renewal | 7/8 | 1 (renewal invoice email) |
| Overdue & Suspension | 6/6 | 0 |
| Termination | 2/4 | 2 (warning + terminated email) |
| Invoice Reminders | 5/5 | 0 |
| Late Fee | 0/2 | 2 |
| Domain | 4/4 | 0 |
| Provisioning | 4/4 | 0 |
| Cron/Scheduler | 8/8 | 0 |
| Usage Sync | 2/2 | 0 |
| Billing Settings | 3/3 | 0 |

**Overall:** 41/46 items ready. **5 gaps** need implementation.

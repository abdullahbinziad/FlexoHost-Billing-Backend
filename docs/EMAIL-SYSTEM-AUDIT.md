# Email System Audit Report

**Date:** March 2025  
**Scope:** All email flows – transactional, cron, automation, manual  
**Roles:** Software QA + Security Engineer

---

## 1. Email Flows Inventory

| Flow | Trigger | Template | Recipient | Status |
|------|---------|----------|-----------|--------|
| **Account** |
| Welcome | Registration (auth + client) | `account.welcome` | New user | ✅ |
| Verify email | Registration (new user) | `account.verify_email` | New user | ✅ |
| Password reset | Forgot password | `account.password_reset` | User | ✅ |
| **Billing** |
| Invoice created | Invoice create, Order create | `billing.invoice_created` | Client | ✅ |
| Payment success | Invoice paid (gateway, manual, status update) | `billing.payment_success` | Client | ✅ |
| Payment failed | Gateway fail redirect | `billing.payment_failed` | Client | ✅ Fixed |
| Overdue reminder | Cron (invoice-reminder) | `billing.overdue_reminder` | Client | ✅ |
| Suspension warning | Cron (invoice-reminder) | `service.suspension_warning` | Client | ✅ |
| **Order** |
| Order confirmation | Order create | `order.confirmation` | Client | ✅ |
| **Service** |
| Hosting account created | Provisioning worker (hosting) | `service.hosting_account_created` | Client | ✅ |
| Hosting ready | Manual (no password) | `service.hosting_ready` | Client | ✅ |
| Service suspended | Service action worker (SUSPEND) | `service.suspended` | Client | ✅ Fixed |
| **Domain** |
| Registration confirmation | Provisioning worker (domain) | `domain.registration_confirmation` | Client | ✅ |
| Renewal reminder | Cron (domain-expiry-reminder) | `domain.renewal_reminder` | Client | ✅ |
| Expired notice | Cron (domain-expiry-reminder) | `domain.expired_notice` | Client | ✅ Fixed |
| **Support** |
| Ticket opened | Create ticket | `support.ticket_opened` | Client | ✅ |
| Ticket reply | Staff reply | `support.ticket_opened` (reused) | Client | ⚠️ Consider dedicated template |
| **Automation** |
| Failure alert | Cron (automation task fails) | Raw HTML | `automationAlerts.emailTo` | ✅ |
| Recovery alert | Cron (task recovers) | Raw HTML | `automationAlerts.emailTo` | ✅ |
| Digest | Cron (automation digest) | Raw HTML | `automationDigest.emailTo` | ✅ |
| **Manual** |
| Custom client email | Admin send | Raw HTML | Client | ✅ |

---

## 2. Fixes Applied

### 2.1 Duplicate Payment Confirmation (invoice.service.ts)
- **Issue:** When admin added full payment with "Send Email" checked, both the templated payment success block and the notificationProvider block ran → duplicate emails.
- **Fix:** Only run the notificationProvider block when `data.sendEmail && !fullyPaid` (partial payment notification).

### 2.2 Missing Service Suspended Email (service-action.worker.ts)
- **Issue:** When a service was suspended (overdue invoice), no email was sent to the client.
- **Fix:** After successful SUSPEND action, send `service.suspended` email with restore URL, reason, and support link.

### 2.3 Missing Domain Expired Notice (domain-expiry-reminder.scheduler.ts)
- **Issue:** `domain.expired_notice` template existed but was never sent when a domain expired.
- **Fix:** Added processing for domains with `expiresAt < startOfToday`, send expired notice once per domain (logged in `DomainReminderLog` with type `DOMAIN_EXPIRED`).

### 2.4 Missing Payment Failed Email (payment.controller.ts)
- **Issue:** When gateway redirected to fail URL, only audit log was written; no email to client.
- **Fix:** On `handleFail`, load invoice + client, send `billing.payment_failed` email with retry link.

### 2.5 Security Documentation (hosting-account-email.service.ts)
- **Note:** Hosting account email includes cPanel password in plaintext. Documented security considerations (TLS, alternative "set password" link, no logging).

---

## 3. Data & Validation

### 3.1 Proper Data in Emails
- **Invoice emails:** `invoiceNumber`, `dueDate`, `amountDue`, `currency`, `lineItems`, `invoiceUrl`, `billingUrl` – all populated from invoice/client.
- **Order confirmation:** `orderNumber`, `items`, `subtotal`, `total`, `currency`, `clientAreaUrl`, `supportUrl`.
- **Domain emails:** `domain`, `expirationDate`, `daysRemaining`, `renewUrl` / `restoreUrl`.
- **Hosting account:** `domain`, `cpanelUrl`, `cpanelUsername`, `cpanelPassword`, `nameservers`, `clientPortalUrl`, `supportEmail`.

### 3.2 Gaps / TODOs
- **Domain renewal reminder:** `renewalPrice` is hardcoded to `'0'` – TODO: get from TLD pricing.
- **Invoice reminder suspension_warning:** `suspensionDate` defaults to invoice `dueDate`; more accurate would be `dueDate + daysBeforeSuspend`.
- **Ticket reply:** Reuses `support.ticket_opened`; consider a dedicated `support.ticket_reply` template for clarity.

---

## 4. Security Findings

### 4.1 XSS Prevention
- **Client custom email:** Uses `escapeHtml()` for `message`, `clientName`, `senderLabel` ✅
- **Automation digest:** Uses `escapeHtml()` for `task.label`, `metricSummary`, dates ✅
- **Automation alert:** Uses `escapeHtml()` for `errorMessage` in HTML ✅
- **Templated emails:** Props are validated via Zod schemas; templates use safe rendering.

### 4.2 Sensitive Data
- **Hosting password:** Sent in `service.hosting_account_created` – documented; ensure SMTP over TLS.
- **Reset/verification tokens:** Sent in URLs; tokens are hashed in DB; URLs are single-use and time-limited.
- **Audit log:** `activity-log.service` redacts `password`, `token`, `accessToken`, `refreshToken`, `secret`, `apiKey`.

### 4.3 Rate Limiting
- Login has brute-force protection; email sending does not have explicit rate limits. Consider throttling for high-volume sends (e.g. invoice reminders).

---

## 5. Cron / Automation Emails

| Job | Emails Sent | Config |
|-----|-------------|--------|
| `invoice-reminder` | Overdue reminders, suspension warnings | `billingSettings.preReminderDays`, `overdueReminderDays`, `suspendWarningDays` |
| `domain-expiry-reminder` | Renewal reminders, expired notices | `billingSettings.domainExpiryReminderDays` |
| `overdue-suspensions` | (none – suspension email sent by service-action.worker) | `billingSettings.daysBeforeSuspend` |
| `automation-alerts` | Failure + recovery | `automationAlerts.emailTo`, `webhookUrl`, `failureThreshold`, `sendRecovery` |
| `automation-digest` | Periodic digest | `automationDigest.emailTo`, `periodHours`, `includeEmpty` |

---

## 6. Configuration

- **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` – required for real sends.
- **URLs:** `FRONTEND_URL`, `CORS_ORIGIN` – used for links in emails.
- **Automation:** `AUTOMATION_ALERTS_EMAIL_TO`, `AUTOMATION_DIGEST_EMAIL_TO`, etc.

---

## 7. Recommendations

1. **Domain renewal price:** Implement TLD-based pricing lookup for domain renewal reminders.
2. **Ticket reply template:** Add `support.ticket_reply` for staff replies.
3. **Suspension date:** Compute `suspensionDate` as `dueDate + daysBeforeSuspend` in invoice reminder for suspension_warning.
4. **Password in email:** Evaluate "Set your password" link flow instead of plaintext password for hosting accounts.
5. **Email rate limiting:** Consider per-recipient or per-template throttling for bulk sends.

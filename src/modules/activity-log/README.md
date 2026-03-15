# Activity Log / Audit Log

Central audit trail for business, security, financial, service, support, and automation events. All entries are written via `auditLog` / `auditLogSafe` and never store secrets.

## API

- **GET** `/api/v1/activity-log` — List entries (admin/staff only).  
  Query params: `page`, `limit`, `search`, `clientId`, `userId`, `actorType`, `category`, `type`, `source`, `severity`, `invoiceId`, `serviceId`, `ticketId`, `dateFrom`, `dateTo`.

## Verifying activity log coverage

After building and running all modules, use the Activity Log UI (Dashboard → Activity Log) and confirm that important actions create entries. Filter by **category** or **type** to narrow results.

### Checklist

| Area | Trigger | Expected type / category |
|------|---------|--------------------------|
| **Payment** | Pay invoice (success) | `payment_received`, category `payment` |
| **Payment** | Pay invoice (fail / cancel) | `payment_failed`, category `payment` |
| **Invoice** | Create / update / delete (admin) | `invoice_created`, `invoice_updated`, `invoice_cancelled`, `invoice_deleted`, `credit_changed` |
| **Invoice** | Manual payment (admin) | `payment_received`, source `manual` |
| **Auth** | Login success | `login_success`, category `auth` |
| **Auth** | Login failed attempt | `login_failed`, category `auth` |
| **Order** | Create order | `order_created`, category `order` |
| **Service** | Provision (cron) | `service_created`, then `hosting_provisioned` / `vps_provisioned` / `domain_registered` |
| **Service** | Suspend / unsuspend / terminate (admin) | `service_suspended`, `service_unsuspended`, `service_terminated`, etc. |
| **Ticket** | Open / reply / status / close | `ticket_opened`, `ticket_replied`, `ticket_status_changed`, `ticket_closed` |
| **Product** | Create / update (admin) | `product_created`, `product_changed`, category `settings` |
| **Server** | Create / update (admin) | `server_created`, `server_changed`, category `settings` |
| **Module** | Run module create (hosting) | `module_created`, category `service` |
| **Email account** | Create mailbox (hosting) | `email_account_created`, category `service` |
| **Cron** | Trigger renewals / suspensions / reminders | `cron_started`, `cron_completed`, category `cron` or `suspension` |

### Useful filters

- **Category:** `payment`, `invoice`, `order`, `service`, `auth`, `ticket`, `email`, `cron`, `settings`
- **Type:** e.g. `payment_failed`, `payment_received`, `invoice_created`, `login_failed`
- **Source:** `manual` (admin/user), `webhook` (gateway/callback), `cron`, `system`
- **Client:** `clientId` to see all activity for one client

If an action you care about does not appear, add an `auditLogSafe` call in the code path that performs it (see `.cursor/rules/activity-log-services-modules.mdc`).

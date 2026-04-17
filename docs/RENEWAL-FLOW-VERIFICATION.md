# Renewal Flow Verification Guide

This guide explains how to run and interpret the automated renewal-flow verification script.

## What this verifies

The script validates these backend automation behaviors for a test service:

1. Renewal invoice is auto-generated before due date (lead-time rule).
2. Generated invoice keeps service linkage (`items.meta.serviceId`).
3. Unpaid overdue invoice causes service suspension.
4. Suspended service gets terminated after configured threshold.
5. Paid renewal advances `nextDueDate` based on billing cycle.
6. Service action jobs are created (suspend/terminate pipeline visibility).

## Script

- File: `src/scripts/verify-renewal-flow.ts`
- NPM command: `npm run verify:renewal-flow -- <serviceId>`

If `<serviceId>` is omitted, the script automatically picks the latest active hosting service.

## Preconditions

1. Backend project dependencies are installed.
2. `.env` has valid `MONGODB_URI`.
3. Target database contains:
   - a hosting service,
   - billing settings document (`key=global`),
   - invoice/service collections as used by the app.

## Usage

### Run with explicit service ID (recommended)

```bash
npm run verify:renewal-flow -- 69cd0498e42efd1bf3dbb767
```

### Run with auto-selected active hosting service

```bash
npm run verify:renewal-flow
```

## Output

The script prints:

1. A detailed JSON report (`checks.renewal`, `checks.suspend`, `checks.terminate`, `checks.paymentRenewal`, `checks.recentActionJobs`)
2. A human-friendly summary:

```text
[PASS/FAIL] Renewal invoice generated
[PASS/FAIL] Overdue invoice suspends service
[PASS/FAIL] Suspended service terminates
[PASS/FAIL] Paid renewal advances nextDueDate
Overall: PASS/FAIL (x/4)
```

## Safety / Test Data Behavior

The script is designed to be reversible for core state:

- Temporarily adjusts:
  - service status/suspendedAt/terminatedAt/nextDueDate/autoRenew/billingCycle
  - billing settings thresholds (`renewalLeadDays`, `daysBeforeSuspend`, `daysBeforeTermination`)
- Restores those values at the end (in `finally` block), even if an error occurs.

Notes:

- It may create real test artifacts during verification (invoice, action jobs, ledgers), which are useful for auditing checks.
- If you want a fully isolated run, use a dedicated staging database.

## Troubleshooting

- `No active hosting service found`:
  - Provide service ID manually.
- `Billing settings document not found (key=global)`:
  - Seed/init billing settings first.
- Mongo connection errors:
  - Check `MONGODB_URI`, network access, and DB name.

## Related files

- `src/modules/services/jobs/service-renewal.scheduler.ts`
- `src/modules/services/jobs/service-termination.scheduler.ts`
- `src/modules/services/core/service-lifecycle.service.ts`


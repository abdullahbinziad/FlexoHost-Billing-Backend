# Domain System – Dynadot Implementation

## Summary

The billing system now uses a **single registrar architecture** for domains. Dynadot is the active live registrar provider, reached through:

`domain.service` → `domainRegistrarService` → `registrar-registry` → `DynadotRegistrarProvider`

This removes the previous duplicate Dynadot code paths and keeps provisioning, sync, and domain management on the same reusable backend layer.

## What Was Implemented

### 1. Registrar Registry + Shared Service

- **File:** `src/modules/domain/registrar/registrar-registry.ts`
- Registers resolver-ready registrar providers and maps TLD/config names to provider keys.
- **File:** `src/modules/domain/registrar/domain-registrar.service.ts`
- Shared domain registrar service used by search, register, transfer, renew, nameservers, lock, contacts, DNS, EPP, and sync.

### 2. Domain Service Wired to Dynadot

- **File:** `src/modules/domain/domain.service.ts`
- `registerDomain`, `renewDomain`, `transferDomain`, `getDomainDetails`, `updateNameservers`, `get/save lock`, `get/save contacts`, `get/save DNS`, and `getEppCodeForClient` all use the shared registrar service.
- Added `listDomainsByClientId(clientId)` – returns domains (Service + DomainServiceDetails) for a client.
- Added `getDomainServiceForClient(clientId, domainName)` – resolves domain to service + details and checks ownership.
- Added `getEppCodeForClient(clientId, domainName)` – returns live Dynadot EPP code when available, with stored transfer EPP as fallback.

### 3. Domain Sync Scheduler

- **File:** `src/modules/services/jobs/domain-sync.scheduler.ts`
- Uses the shared registrar service and the registrar stored on each domain record.
- Sync now updates expiry, nameservers, lock state, registrar name, and sync timestamps from the live registrar result.

### 4. Domain Provisioning Provider

- **File:** `src/modules/services/provisioning/providers/domain.provider.ts`
- Uses the shared registrar service for register/transfer.
- Applies nameservers through the same shared registrar layer after successful registration.
- Stores the resolved registrar name on the provisioned domain.

### 5. Client-Scoped Domain API

- **Routes (domain.routes.ts):**
  - `GET /domains` – list domains for the effective client (own or acting-as). Uses `getEffectiveClientId`.
  - `GET /domains/:domain/epp` – return live EPP code for that domain when available (owner only).
  - `GET /domains/:domain` – domain details from registrar; non-admin must own the domain (checked via `getDomainServiceForClient`).
  - `PUT /domains/:domain/nameservers` – update nameservers at registrar; ownership required for non-admin.
  - `POST /domains/:domain/renew` – renew domain; ownership required for non-admin.
  - `GET/PUT /domains/:domain/lock` – get/update registrar lock (unlock depends on registrar support).
  - `GET/PUT /domains/:domain/contacts` – get/update registrar contact details.
  - `GET/PUT /domains/:domain/dns` – get/update registrar DNS records.

- **Controller:** All of the above use `getEffectiveClientId` and, where needed, `getDomainServiceForClient` so only the domain owner (or admin/staff) can access or change a domain.

### 6. Dynadot Registrar Robustness

- **Files:** `src/modules/domain/registrars/dynadot-api3.ts`, `src/modules/domain/registrars/dynadot-registrar.provider.ts`
- Uses Dynadot API3 (`api3.json`) directly.
- Normalizes search, domain info, nameservers, contact, DNS, transfer, EPP, and account/order helper responses.
- The old duplicate Dynadot client/shim files were removed.

## Environment

Ensure `.env` has:

```env
DYNADOT_API_KEY=your_key
DYNADOT_API_SECRET=your_secret
DYNADOT_TIMEOUT_MS=30000
```

## EPP Code and Registrar Lock

- **EPP code:** Retrieved live from Dynadot `get_transfer_auth_code` when available. Stored transfer EPP remains as a fallback for transferred domains.
- **Registrar lock:** Dynadot `getDomainDetails` returns lock status. Changing lock (if supported by Dynadot API) can be added later; current implementation does not add a dedicated “set lock” endpoint.

## Domain as Order / Sync from Dynadot

- **Creating a domain as order:** Domains are created as orders via the existing checkout/order flow (domain product with register or transfer). Provisioning then uses Dynadot to register or transfer.
- **Syncing domains from Dynadot:** Sync is limited to domains already in our DB:
  - **Transfer sync:** Pending transfers are polled via Dynadot `get_transfer_status`.
  - **Expiry/domain sync:** We refresh expiry, nameservers, lock state, and registrar sync metadata from Dynadot `domain_info`.
- **Importing existing Dynadot domains:** To “add” a domain that already exists at Dynadot (e.g. reseller account) into the billing system, you would need either a Dynadot “list domains” API (if they add one) or a manual/CSV import that creates a Service (type DOMAIN) + DomainServiceDetails and links it to a client. That flow is not implemented in this pass.

## Frontend

- `GET /domains` now returns `{ domains, total }` for the effective client. The frontend `domainApi.getDomains` and Domain type may need a small mapping if the backend shape (e.g. `serviceId`, `domainName`, `expiresAt`, `nameservers`, `registrarLock`, `hasEppCode`) differs from the existing `Domain` type.
- EPP: use `GET /domains/:domain/epp` to show or copy the auth code for the client.
- Nameservers: use `PUT /domains/:domain/nameservers` with body `{ nameservers: string[] }` (existing route, now ownership-checked and calling Dynadot).

## Optional Next Steps

1. **Contact persistence mapping:** Optionally map updated registrar contact details back into `DomainServiceDetails.contacts`.
2. **Additional registrar providers:** Register Namely / ConnectReseller providers in `registrar-registry.ts` when implemented.
3. **Import existing domains:** Design a flow (e.g. CSV or “claim domain” by name) to create Service + DomainServiceDetails for domains already at Dynadot so they appear in the client’s portfolio.

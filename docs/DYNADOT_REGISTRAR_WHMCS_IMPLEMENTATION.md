# Dynadot Registrar Module – WHMCS-Style Implementation

## Summary

The billing backend now includes a **WHMCS-style registrar adapter** for Dynadot using the **official API3** (`api3.json`). The implementation reuses the existing domain/order/invoice/payment/activity-log and sync architecture; it does not introduce a parallel system. **Dynadot API key is never exposed to the frontend.**

---

## 1. Registrar Architecture

### RegistrarProvider interface (`src/modules/domain/registrar/registrar.types.ts`)

WHMCS-style capability map:

| Function | Description |
|----------|-------------|
| `checkAvailability(domains)` | Check domain availability (multi-domain) |
| `registerDomain(params)` | Register domain with contacts, years, currency |
| `transferDomain(params)` | Transfer in with auth code |
| `renewDomain(params)` | Renew domain (years, optional late-fee skip) |
| `getDomainInformation(domain)` | Full domain info (status, expiry, NS, contacts, lock, privacy) |
| `getNameservers(domain)` | Get nameservers |
| `saveNameservers(domain, nameservers)` | Set nameservers (set_ns) |
| `getRegistrarLock(domain)` | Get lock status |
| `saveRegistrarLock(domain, locked)` | Lock only (unlock not implemented per docs) |
| `getContactDetails(domain)` | Get registrant/admin/tech/billing contacts |
| `saveContactDetails(domain, contacts)` | Set whois contacts (set_whois) |
| `getDns(domain)` | Get DNS records |
| `saveDns(domain, records)` | Set DNS (set_dns2) |
| `getEppCode(domain, options)` | Get transfer auth code (optional new code / unlock for transfer) |
| `registerNameserver(hostname, ip)` | Register child NS |
| `modifyNameserver(hostnameOrId, ips)` | Set NS IP(s) |
| `deleteNameserver(hostnameOrId)` | Delete child NS |
| `syncDomain(domainNameOrId)` | Fetch and return current domain info |
| `syncTransfer(domain)` | Get transfer status |
| `getTldPricing(tlds?)` | TLD pricing (admin/sync utility) |
| `getAccountBalance?()` | Account balance (optional) |
| `getOrderStatus?(orderId)` | Order status (optional) |
| `listDomains?()` | List account domains (optional) |
| `isProcessing?()` | Check if account has processing orders (optional) |

### Dynadot command map

| WHMCS-style function | Dynadot API3 command |
|----------------------|------------------------|
| checkAvailability | `search` |
| registerDomain | `register` |
| transferDomain | `transfer` |
| getTransferStatus | `get_transfer_status` |
| cancelTransfer | `cancel_transfer` |
| renewDomain | `renew` |
| getDomainInformation | `domain_info` (+ `get_ns` for NS list) |
| getNameservers | `domain_info` / `get_ns` |
| saveNameservers | `set_ns` |
| getRegistrarLock | (from domain_info) |
| saveRegistrarLock | `lock_domain` (lock only; unlock not in docs) |
| getContactDetails | `domain_info` + `get_contact` |
| saveContactDetails | `set_whois` (+ create_contact / edit_contact as needed) |
| getDns | `get_dns` |
| saveDns | `set_dns2` |
| getEppCode | `get_transfer_auth_code` |
| registerNameserver | `register_ns` |
| modifyNameserver | `set_ns_ip` |
| deleteNameserver | `delete_ns` |
| syncDomain | `domain_info` |
| syncTransfer | `get_transfer_status` |
| getTldPricing | `tld_price` |
| getAccountBalance | `get_account_balance` |
| getOrderStatus | `get_order_status` |
| listDomains | `list_domain` |
| isProcessing | `is_processing` |

---

## 2. Dynadot API3 helper

- **File:** `src/modules/domain/registrars/dynadot-api3.ts`
- **URL:** `https://api.dynadot.com/api3.json` (production).
- **Auth:** `key=<DYNADOT_API_KEY>` and `command=<COMMAND>` (query params).
- **`callDynadot(command, params)`:**  
  Sends GET request, parses JSON, normalizes success (ResponseCode 0) / failure, throws `RegistrarError` with safe message (no key/secret). Handles timeout and malformed response.

---

## 3. Config / env

| Variable | Description |
|----------|-------------|
| `DYNADOT_API_KEY` | Production API key (required for domain ops) |
| `DYNADOT_API_SECRET` | Production API secret (if needed for legacy/restful) |
| `DYNADOT_TIMEOUT_MS` | Request timeout in ms (default 30000) |
| `DYNADOT_API3_URL` | Override api3 URL (optional; defaults to production) |

Integration uses **production** only; sandbox is not used.

### IP whitelist (required by Dynadot)

Dynadot only accepts API requests from **whitelisted IP addresses**. In your Dynadot account:

1. Go to the API / IP whitelist settings.
2. Add the **outbound IP** of the server that runs this backend (e.g. your app server or cron runner).
3. You can add a single IP (e.g. `103.14.23.18`) or a CIDR range (e.g. `192.168.1.0/24`).
4. Reseller/API accounts require **at least one IP** to enable the API.

If the server IP is not whitelisted, Dynadot will reject requests (often with an authorization or IP-restriction error). Use your hosting provider’s docs or a service like `curl ifconfig.me` from the server to confirm its outbound IP before adding it in Dynadot.

---

## 4. Error handling

- All registrar errors are normalized to **`RegistrarError`** with:
  - `registrar`: `"dynadot"`
  - `command`
  - `domain` (when applicable)
  - `message` (safe, no secrets)
  - `registrarCode` (Dynadot response code if any)
  - `rawSafeSummary` (short safe summary)
- Handled cases: invalid/missing API key, IP restriction, insufficient balance, domain unavailable, invalid auth code, invalid contact id, timeout, malformed response. **Secrets are never logged.**

---

## 5. Activity log

Registrar events logged via `registrarAudit()` (category `domain`, safe meta only):

- `domain.search.performed`
- `domain.register.requested` / `domain.register.completed` / `domain.register.failed`
- `domain.transfer.requested` / `domain.transfer.status_updated`
- `domain.renew.completed`
- `domain.nameservers_updated`
- `domain.contacts_updated` / `domain.dns_updated` / `domain.epp_code_requested` (when called from flows that use the provider)
- `domain.sync.completed`
- `registrar.dynadot.balance_checked`

---

## 6. Integration with existing flows

- **Availability:** Client/admin domain search uses `domainRegistrarService.checkAvailability()` which resolves registrar by domain/TLD and calls the provider directly.
- **Registration:** After order + payment, provisioning uses `domainRegistrarService.registerDomain()` and stores the resolved registrar name with the domain details.
- **Transfer:** Transfer requests use `domainRegistrarService.transferDomain()`; sync uses `domainRegistrarService.getTransferStatus()`.
- **Renewal:** Manual and automatic renewal use `domainRegistrarService.renewDomain()`.
- **Management:** Nameservers, lock, contacts, DNS, and EPP all go through `domainRegistrarService`, which delegates to the resolved provider.
- **Sync:** Domain sync cron uses `domainRegistrarService.getDomainInformation()` / `getTransferStatus()` based on the registrar stored in `DomainServiceDetails`.
- **Scalability:** Registrar resolution is centralized in `registrar-registry.ts`, so additional providers can be registered without changing domain service, provisioning, or sync code paths.

---

## 7. Unsupported / gaps

- **Unlock domain:** Only **lock** is implemented (`lock_domain`). Unlock is not documented in the current Dynadot API command list; `saveRegistrarLock(domain, false)` throws a clear “Unlock not supported” error. Can be extended if Dynadot adds an unlock command.
- **EPP from API:** EPP is retrieved live via `get_transfer_auth_code`; no dependency on stored EPP in our DB for this path.
- Integration is production-only; sandbox is not used.

---

## 8. Changed / new files

| File | Change |
|------|--------|
| `src/config/index.ts` | Added `dynadot.useSandbox`, `dynadot.timeoutMs`, `dynadot.api3Url` |
| `src/modules/domain/registrar/registrar.types.ts` | **New** – `IRegistrarProvider`, `RegistrarError`, all param/result types |
| `src/modules/domain/registrar/registrar-audit.ts` | **New** – `registrarAudit()` for domain/registrar events |
| `src/modules/domain/registrar/registrar-registry.ts` | **New** – registrar registration + TLD/alias-based resolution |
| `src/modules/domain/registrar/domain-registrar.service.ts` | **New** – single reusable registrar service for search/register/transfer/renew/manage/sync |
| `src/modules/domain/registrars/dynadot-api3.ts` | **New** – `callDynadot()`, response parsing, no secrets in errors |
| `src/modules/domain/registrars/dynadot-registrar.provider.ts` | **New** – `DynadotRegistrarProvider` implementing full WHMCS-style map |
| `src/modules/domain/domain.service.ts` | Uses `domainRegistrarService`, updates local cache after live registrar changes |
| `src/modules/services/jobs/domain-sync.scheduler.ts` | Uses `registrarAudit` for transfer status and sync completed |
| `src/modules/services/provisioning/providers/domain.provider.ts` | Uses `domainRegistrarService` for register/transfer and applies nameservers through the shared registrar layer |
| `docs/DYNADOT_REGISTRAR_WHMCS_IMPLEMENTATION.md` | **New** – this summary |

The previous duplicate Dynadot shim layers were removed. The active backend path is now: **route/controller → domain.service → domainRegistrarService → registrar-registry → DynadotRegistrarProvider → Dynadot API3**.

# WHM/cPanel Integration – Backend Notes

## Summary

- **Auth:** WHM username + API token only (no root password stored).
- **Token storage:** API token is encrypted at rest (AES-256-GCM) before saving in `Server.module.apiToken`. Never returned in API responses; responses include `module.hasApiToken: true` when set.
- **Per-server:** Each server has its own `module` (hostname, port, useSSL, username, apiToken). WHM calls use the corresponding server’s credentials.

---

## What Was Changed / Added

### 1. Encryption (`src/utils/encryption.ts`)
- `encrypt(plainText)` / `decrypt(cipherText)` for storing WHM API tokens.
- Uses `ENCRYPTION_KEY` or `JWT_SECRET`; key derived with scrypt.
- `isEncrypted(value)` to detect already-encrypted values (avoid double-encrypt on update).

### 2. Server model (`src/modules/server`)
- **Schema:** `lastConnectionCheckAt`, `lastConnectionStatus` (`'success' | 'failed'`), `createdBy` (ObjectId ref User).
- **Service:**  
  - Encrypts `module.apiToken` on create/update (if plain text).  
  - `normalizeServerForApi()` never returns `module.apiToken` or `module.password`; adds `module.hasApiToken`.  
  - `getServerByIdWithToken(id)` for internal use only (returns decrypted token).  
  - `getWhmClient(serverId)` returns a `WhmApiClient` for that server.  
  - `testWhmConnection(serverId)` – calls WHM, updates `lastConnectionCheckAt` / `lastConnectionStatus`.  
  - `listWhmPackages(serverId)` – returns package list from WHM.
- **Controller:** `testConnection`, `getPackages`.
- **Routes:** `POST /servers/:id/test-connection`, `GET /servers/:id/packages`.

### 3. WHM API client (`src/modules/whm/whm-api-client.ts`)
- **Class `WhmApiClient`** – options: hostname, port, useSSL, username, apiToken, timeoutMs.
- Methods: `request()`, `testConnection()`, `listPackages()`, `createAccount()`, `suspendAccount()`, `unsuspendAccount()`, `terminateAccount()`, `changePackage()`, `verifyUsername()`, **`createUserSession(cpanelUsername, 'cpaneld' | 'webmail')`** (returns login URL for SSO).

### 4. Services module
- **SSO:**  
  - `GET /services/client/:clientId/:serviceId/login/cpanel`  
  - `GET /services/client/:clientId/:serviceId/login/webmail`  
  - Returns `{ url }` for redirect. Only service owner (resolved via Client by user) or admin/staff can call.
- **Service admin:** Suspend / unsuspend / terminate for **HOSTING** now call WHM on the server linked in hosting details, then update DB.  
- **Change package:** `POST /services/admin/:serviceId/change-package` body `{ plan: string }` – calls WHM `changepackage` and updates hosting details.
- **Auth:** Service routes use `protect` and `restrictTo('admin','superadmin','staff')` for admin routes; client routes use `protect` and controller checks ownership via `getClientIdForUser(user)` (Client collection by user._id).

### 5. Service client controller
- **`getClientIdForUser(user)`** – returns `user.clientId` or resolves from `Client.findOne({ user: user._id })` so client users without `user.clientId` still pass ownership checks when `clientId` in URL matches their client.

---

## Env / Config

- **Optional:** `ENCRYPTION_KEY` – used to encrypt WHM API tokens. If unset, `JWT_SECRET` is used. In production, set `ENCRYPTION_KEY` for clarity.
- Existing `WHM_*` globals are still used by the legacy single-server WHM routes; per-server config is in the Server document.

---

## Frontend Usage

1. **Server config (admin)**  
   - Create/update server with `module.apiToken` (plain) when saving; backend encrypts before store.  
   - On edit, token is not returned; show masked placeholder and “Leave blank to keep current” if you support partial update.

2. **Test connection**  
   - `POST /api/v1/servers/:id/test-connection`  
   - Response: `{ success, message?, error?, version? }`.

3. **Package list**  
   - `GET /api/v1/servers/:id/packages`  
   - Response: `{ packages: [...] }`.

4. **cPanel / Webmail login**  
   - `GET /api/v1/services/client/:clientId/:serviceId/login/cpanel` (or `.../login/webmail`) with auth cookie/header.  
   - Response: `{ url: "https://..." }`.  
   - Frontend: open `url` in same or new tab (redirect).

5. **Admin service actions**  
   - Suspend: `POST /api/v1/services/admin/:serviceId/suspend`  
   - Unsuspend: `POST .../unsuspend`  
   - Terminate: `POST .../terminate`  
   - Change package: `POST .../change-package` body `{ plan: "packagename" }`  
   - All require admin/superadmin/staff.

---

## Assumptions

- WHM API `create_user_session` exists and accepts `user` and `service` (`cpaneld` / `webmail`). If your WHM version uses a different call (e.g. `api_token_create`), adjust `WhmApiClient.createUserSession()`.
- Hosting service details store `serverId` and `accountUsername`; provisioning (e.g. hosting provider) sets these when the account is created.
- Existing Server documents may have plain `module.apiToken`; they are encrypted on next update. Reading supports both encrypted and plain for backward compatibility during migration.

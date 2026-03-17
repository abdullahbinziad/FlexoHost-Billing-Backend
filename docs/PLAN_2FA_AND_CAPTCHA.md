# Implementation Plan: Two-Step Verification (2FA) & CAPTCHA for Clients

This document outlines a full plan to add **two-step verification (2FA)** and **CAPTCHA** for client authentication, aligned with your existing auth flow and activity log.

**Consolidated plan with all improvements (login alerts, throttling, activity log, OAuth, config):** see [FULL_PLAN_2FA_CAPTCHA_LOGIN_ALERTS.md](./FULL_PLAN_2FA_CAPTCHA_LOGIN_ALERTS.md) for the single build-out checklist.

---

## 1. Overview

| Feature | Purpose |
|--------|---------|
| **CAPTCHA** | Reduce automated attacks on login, registration, and forgot-password (bot protection). |
| **2FA (TOTP)** | Second factor for clients: after correct password, user must enter a 6-digit code from an authenticator app (e.g. Google Authenticator, Authy). |

**Scope**

- **CAPTCHA**: Applied to **client-facing** (and shared) auth actions: login, client register, forgot-password. Optionally admin login too.
- **2FA**: **Clients only** (and optionally `user` role). Admin/staff 2FA can be added later using the same backend plumbing.

---

## 2. CAPTCHA (reCAPTCHA)

### 2.1 Choice

- **Google reCAPTCHA v3** (recommended): Invisible, score-based, best UX. Use for login/register/forgot-password.
- **Alternative**: reCAPTCHA v2 “I’m not a robot” checkbox if you prefer visible challenge.

### 2.2 Backend

1. **Config** (`config/index.ts` + `.env`)
   - Add `recaptcha: { secretKey: string; enabled: boolean }`.
   - Env: `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_ENABLED` (default true in production).

2. **Recaptcha service** (new)
   - File: `src/modules/recaptcha/recaptcha.service.ts`.
   - `verifyToken(token: string, expectedAction?: string): Promise<{ success: boolean; score?: number }>`.
   - Call `https://www.google.com/recaptcha/api/siteverify` (POST) with secret and token.
   - If using v3: optionally enforce minimum score (e.g. 0.5) and action name.

3. **Where to verify**
   - **Login**: `auth.controller.ts` → before `authService.login()`; validate CAPTCHA token from body (e.g. `req.body.captchaToken`).
   - **Register**: Same for `auth.controller.register` and `client.controller.registerClient` (both accept a `captchaToken`).
   - **Forgot password**: In `auth.controller.forgotPassword`, verify CAPTCHA before sending reset email.

4. **Validation**
   - In `auth.validation.ts` and client validation: add optional `body('captchaToken')` when CAPTCHA is enabled (required when `RECAPTCHA_ENABLED=true`).

5. **Behavior when CAPTCHA is disabled**
   - If `RECAPTCHA_ENABLED=false`, skip verification so dev/local stays easy.

### 2.3 Frontend

1. **Env**
   - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (v3 site key).

2. **Package**
   - Add `react-google-recaptcha-v3` (or similar) for reCAPTCHA v3.

3. **Login page**
   - Get reCAPTCHA v3 token on submit (action e.g. `login`), send it as `captchaToken` in the login request.

4. **Register page(s)**
   - Same: get token (action `register`), send in register request body.

5. **Forgot-password page**
   - Get token (action `forgot_password`), send in forgot-password request.

6. **Error handling**
   - If backend returns 400 “Invalid or expired captcha”, show message and let user retry (re-fetch token and resubmit).

---

## 3. Two-Step Verification (2FA) for Clients

### 3.1 Method

- **TOTP (Time-based One-Time Password)** via authenticator apps (Google Authenticator, Authy, etc.).
- **Backup codes**: One-time use codes generated at 2FA enable; user stores them safely.

### 3.2 Backend

#### 3.2.1 User model and storage

- **User** (or Client if you prefer 2FA on client profile; recommended on User so one place for auth):
  - `twoFactorEnabled: { type: Boolean, default: false }`
  - `twoFactorSecret: { type: String, select: false }` (encrypted TOTP secret)
  - `twoFactorBackupCodes: [{ type: String }]` (hashed, select: false) – e.g. 10 codes
  - Optionally `twoFactorBackupCodesUsed: [Date]` or a separate model to track used codes

- **Security**: Store TOTP secret encrypted (use existing `utils/encryption` if you have it). Hash backup codes (e.g. bcrypt or SHA-256) before saving.

#### 3.2.2 Dependencies

- `speakeasy` – TOTP generate/verify.
- `qrcode` – Generate QR code for “add to authenticator” (optional; can also show secret as text).
- No new DB; only schema + migration for existing users (default `twoFactorEnabled: false`).

#### 3.2.3 New auth endpoints (under `/api/v1/auth`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/2fa/setup` | Yes (JWT) | Generate TOTP secret + QR URL; return secret and QR image/data URL. Do not enable 2FA yet. |
| POST | `/auth/2fa/verify-setup` | Yes | Body: `{ code: string }`. Verify TOTP, enable 2FA, generate and return backup codes (plain once). |
| POST | `/auth/2fa/disable` | Yes | Body: `{ password: string, code?: string }`. Verify password (and optional TOTP), disable 2FA, clear secret and backup codes. |
| POST | `/auth/2fa/verify-login` | No | Body: `{ temporaryToken: string, code: string }`. Verify TOTP or backup code; issue real access + refresh tokens. |
| GET  | `/auth/2fa/status` | Yes | Return `{ twoFactorEnabled: boolean }` (for client UI). |

**Login flow change (password-only login)**

1. User submits email + password (and captchaToken).
2. Backend validates CAPTCHA, then finds user and checks password.
3. **If user has `twoFactorEnabled === false`**: current behavior – issue tokens and return user + tokens.
4. **If user has `twoFactorEnabled === true`**:
   - Do **not** issue normal JWT.
   - Issue a **short-lived “2FA pending” token** (e.g. 5 min), store in memory/Redis or sign with a different secret and put `userId` + `purpose: '2fa_login'` in payload.
   - Return HTTP 200 with body, e.g. `{ requiresTwoFactor: true, temporaryToken: "..." }` (no accessToken/refreshToken).
5. Frontend redirects to a 2FA verification page and sends `temporaryToken` + 6-digit `code` to `POST /auth/2fa/verify-login`.
6. Backend verifies temporary token, verifies TOTP (or backup code), then issues real access + refresh tokens and returns same shape as normal login.

**Restrict 2FA to clients**

- In `auth.controller` / `auth.service`: allow `2fa/setup`, `2fa/verify-setup`, `2fa/disable`, `2fa/status` only for users with role `client` (or `user` if you want). Admins get 403 or “not available” for these until you add admin 2FA later.

#### 3.2.4 Activity log

- On 2FA enable (after verify-setup): `auditLogSafe({ type: 'twofa_changed', category: 'auth', message: 'Two-factor authentication enabled', ... })`.
- On 2FA disable: same type, message “Two-factor authentication disabled”.
- On 2FA login success/failure: reuse or add event type (e.g. `twofa_login_success` / `twofa_login_failed`) and log with `clientId`/`userId` and IP/user-agent (same pattern as existing `login_success` / `login_failed`).

---

## 4. Frontend (2FA)

### 4.1 Login flow

- After `login()`:
  - If response has `requiresTwoFactor: true` and `temporaryToken`:
    - Store `temporaryToken` in memory or sessionStorage (short-lived).
    - Redirect to `/login/verify-2fa` (and preserve `redirect` query for after full login).
  - Else: existing behavior (set tokens, redirect).

### 4.2 New page: `/login/verify-2fa`

- Single input: 6-digit code (and optional “Use backup code” link that switches to backup-code input).
- Submit: `POST /auth/2fa/verify-login` with `{ temporaryToken, code }`.
- On success: receive tokens, persist them, clear temporary token, redirect to intended destination (e.g. `/` or `/admin` by role).
- On failure: show error (invalid code, expired temporary token, etc.).

### 4.3 Client area: Security / 2FA settings

- Under client dashboard (e.g. “Account” or “Security” under `/me` or profile):
  - **If 2FA disabled**: “Enable two-factor authentication” → calls `GET` (or backend returns setup data on demand) then `POST /auth/2fa/setup`; show QR code + secret; then “Verify” with first code → `POST /auth/2fa/verify-setup` → show backup codes once, then “Done”.
  - **If 2FA enabled**: “Disable two-factor authentication” (with password + optional TOTP) and “Regenerate backup codes” (optional; new endpoint that invalidates old codes and returns new ones).

### 4.4 API client

- Add methods: `loginWith2FA(temporaryToken, code)`, `get2FAStatus()`, `setup2FA()`, `verify2FASetup(code)`, `disable2FA(password, code?)`.
- Auth context: handle `requiresTwoFactor` in login response and redirect to verify-2fa page.

---

## 5. Implementation Order

1. **CAPTCHA**
   - Backend: config, recaptcha service, verify in login/register/forgot-password.
   - Frontend: add site key, get token on submit, send `captchaToken` in requests.
2. **2FA – Backend**
   - User schema + migration (add 2FA fields).
   - speakeasy + qrcode; 2FA service (setup, verify-setup, disable, verify-login).
   - New routes and controller; modify login in auth.service/auth.controller to return `requiresTwoFactor` + temporaryToken when 2FA enabled.
   - Restrict 2FA endpoints to client (and optionally user) role.
   - Activity log for twofa_changed and 2FA login.
3. **2FA – Frontend**
   - Verify-2FA page and login flow branching.
   - Security/account section: enable 2FA (setup + verify-setup), disable 2FA, optionally regenerate backup codes.

---

## 6. Security Notes

- **Temporary token**: Short TTL (5 min), single-use (invalidate after successful verify-login or after max attempts).
- **Backup codes**: Hash before storing; mark as used when consumed; allow “regenerate” which invalidates old codes.
- **Rate limiting**: Keep existing auth rate limit; optionally add stricter limit on `POST /auth/2fa/verify-login` (e.g. 5 attempts per temporaryToken).
- **CAPTCHA**: Don’t log or store the token; verify server-side and discard. Use HTTPS in production so token is not sniffed.

---

## 7. Optional Enhancements (Later)

- **Email OTP fallback**: If user loses device, “Send code to email” from verify-2fa page (with rate limit and expiry).
- **Admin 2FA**: Same TOTP flow for admin/staff; restrict setup/disable to own account.
- **Remember this device**: Optional “trust this device for 30 days” (store a signed cookie or token that bypasses 2FA for that device; implement with care).

This plan keeps your existing auth, CSRF, and activity log patterns while adding CAPTCHA and a clear 2FA path for clients. If you want, next step is to implement CAPTCHA first (smallest change), then 2FA backend, then 2FA frontend.

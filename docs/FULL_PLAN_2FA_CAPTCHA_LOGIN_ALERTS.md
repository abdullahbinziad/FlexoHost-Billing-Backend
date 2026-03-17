# Full Plan: 2FA, CAPTCHA, and Login Alerts

Single consolidated plan including all improvements: login alert emails (success + wrong password, all users), throttling, activity log, Google OAuth alert, customerName/forgotPasswordUrl, config toggles, CAPTCHA, and 2FA for clients.

---

## Execution order

1. **Login alert emails** (success + wrong password, all users) – with throttling, activity log, OAuth, and config.
2. **CAPTCHA** – reCAPTCHA v3 on login, register, forgot-password.
3. **2FA backend** – User schema, endpoints, login flow change, activity log.
4. **2FA frontend** – Verify-2FA page, Security/Account UI.

---

## Part 1: Login alert emails (all users)

### 1.1 Success login alert

- **Scope:** All users (all roles).
- **When:** After successful password login in `auth.controller.ts`; after Google OAuth in `getGoogleCallback` (same template, IP/userAgent from req); after successful `POST /auth/2fa/verify-login` when 2FA exists.
- **Content:** Time (formatted), IP, user-agent (device/browser). Optional later: GeoIP location.
- **customerName fallback:** Use `user.name` if present, else client fullName (for client role), else `user.email` or "User" so every role has a valid greeting.
- **Config:** Env `LOGIN_ALERT_SUCCESS_ENABLED` (default true); when false, skip sending. Respect in auth controller and OAuth callback.
- **Throttle (improvement):** Optional but recommended: max 1 success alert per user per 15 minutes (in-memory or Redis key per userId); skip send if within window, still complete login.
- **Implementation:** New template `account.login_alert` in `src/modules/email/templates/account/login-alert.ts`, props: customerName, loginTime, ipAddress, userAgent; register in registry, types, schemas, props-map. In auth controller after login success (and in getGoogleCallback after loginWithGoogle), if `LOGIN_ALERT_SUCCESS_ENABLED` and not throttled, call `sendTemplatedEmail` (fire-and-forget).

### 1.2 Failed login alert (wrong password)

- **Scope:** All users. Send only when account **exists** and **password was wrong** (do not send when email not found; API keeps generic "Invalid email or password").
- **When:** In `user.service.ts` `login()`, when user found and `comparePassword` is false; before `incrementLoginAttempts()` and throw.
- **Content:** Attempt time, IP, user-agent, "If this wasn't you, change your password" with link. **forgotPasswordUrl:** Build from `config.frontendUrl + '/forgot-password'`.
- **Throttle (required):** Max **1 failed-login email per 15 minutes per user** (or 3 per hour). Store last-sent time (in-memory or Redis by userId); if within window, skip email but still return 401. Prevents email bombing.
- **Activity log (required):** When the alert email is sent, call `auditLogSafe`: type `login_failed_alert_sent` (add to `activity-log.interface.ts`), category `auth`, actorType `system`, targetType `user`, targetId, clientId if any, ipAddress, userAgent, meta `{ alert: 'failed_login_email_sent' }`.
- **Config:** Env `LOGIN_ALERT_FAILED_ENABLED` (default true); when false, skip sending.
- **Implementation:** New template `account.failed_login_alert` (failed-login-alert.ts), props: customerName, attemptTime, ipAddress, userAgent, forgotPasswordUrl; register in registry, types, account schemas, props-map. Auth controller passes `{ ip, userAgent }` into `authService.login(body, context)`. User.service: login(body, context?); on wrong password, if context and throttle and config allow: send email, call `auditLogSafe` for `login_failed_alert_sent`, then `incrementLoginAttempts()` and throw.

---

## Part 2: CAPTCHA (reCAPTCHA v3)

- **Config:** `config/index.ts` + .env: `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_ENABLED` (default true in production).
- **Backend:** New `src/modules/recaptcha/recaptcha.service.ts`: `verifyToken(token, action?)` calling Google siteverify; enforce min score (e.g. 0.5) when enabled. Verify in auth.controller (login, forgot-password) and client.controller (register) before proceeding; require `captchaToken` when `RECAPTCHA_ENABLED=true`.
- **Frontend:** `react-google-recaptcha-v3`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`; get token on submit (actions: login, register, forgot_password), send as `captchaToken`. Handle 400 "Invalid or expired captcha".

---

## Part 3: 2FA for clients

- **User schema:** `user.model.ts`: `twoFactorEnabled`, `twoFactorSecret` (encrypted), `twoFactorBackupCodes` (hashed). See `docs/PLAN_2FA_AND_CAPTCHA.md` for encryption/hash details.
- **Endpoints:** POST `/auth/2fa/setup`, `/auth/2fa/verify-setup`, `/auth/2fa/disable`, POST `/auth/2fa/verify-login`, GET `/auth/2fa/status`. Restrict setup/disable to client (and optionally user) role.
- **Login flow:** When `twoFactorEnabled`, return `{ requiresTwoFactor: true, temporaryToken }` (short-lived JWT, e.g. 5 min); no access/refresh tokens until `POST /auth/2fa/verify-login` with valid TOTP or backup code. **Rate limit:** e.g. 5 attempts per temporaryToken on verify-login.
- **Activity log:** `twofa_changed` on enable/disable; log 2FA login success/failure (IP, userAgent). After verify-login success: send success login-alert email (Part 1.1).
- **OAuth-only users:** For "Disable 2FA", allow TOTP-only verification when user has no password (or require set password first); document in code.
- **Frontend:** `/login/verify-2fa` page; AuthContext handles `requiresTwoFactor` and redirect; client Security/Account: enable (setup → verify-setup → backup codes), disable, optionally regenerate backup codes.

---

## Full implementation checklist

**Phase 1 – Login alerts**

- [ ] Add `login_failed_alert_sent` to `src/modules/activity-log/activity-log.interface.ts`.
- [ ] Template `account.login_alert` + schema + registry + types + props-map. Helper for customerName (user.name / client fullName / user.email / "User").
- [ ] Config: `LOGIN_ALERT_SUCCESS_ENABLED`, `LOGIN_ALERT_FAILED_ENABLED` (default true). Optional: success throttle (1 per 15 min per user).
- [ ] Auth controller: after login success, send login-alert (if enabled, optional throttle); in `getGoogleCallback` after loginWithGoogle, send login-alert with IP/userAgent from req.
- [ ] Template `account.failed_login_alert` + schema + registry + types + props-map. forgotPasswordUrl = config.frontendUrl + '/forgot-password'.
- [ ] Auth controller: pass `{ ip, userAgent }` to `authService.login(body, context)`.
- [ ] User.service: login() accept optional context; on wrong password: throttle (1 per 15 min per user), if LOGIN_ALERT_FAILED_ENABLED send email, call auditLogSafe(`login_failed_alert_sent`), then incrementLoginAttempts and throw.

**Phase 2 – CAPTCHA**

- [ ] Config recaptcha (secretKey, enabled). Recaptcha service verifyToken(). Auth + client controller: verify before login/register/forgot-password. Validation: captchaToken when enabled.
- [ ] Frontend: reCAPTCHA v3, site key, token on submit for login/register/forgot-password.

**Phase 3 – 2FA backend**

- [ ] User schema 2FA fields. speakeasy, qrcode. 2FA service (setup, verify-setup, disable, verify-login). Routes + controller. Login returns requiresTwoFactor + temporaryToken when 2FA on. Rate limit verify-login. Activity log twofa_changed and 2FA login. Send success login-alert after verify-login.

**Phase 4 – 2FA frontend**

- [ ] Verify-2FA page; login flow branch; client Security: enable/disable 2FA, backup codes. OAuth-only: disable with TOTP only when no password.

---

## What to skip (for now)

- Email OTP fallback; "Remember this device"; Admin 2FA (same backend can support later).

---

## Reference

- Endpoint list and security notes: `docs/PLAN_2FA_AND_CAPTCHA.md`.

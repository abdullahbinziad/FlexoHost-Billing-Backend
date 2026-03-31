# Environment variables reference

## Backend

| Variable | Purpose |
|----------|---------|
| **Server** | |
| `NODE_ENV` | development / production |
| `PORT` | Backend listen port |
| `API_VERSION` | API path prefix (e.g. v1) |
| **Database** | |
| `MONGODB_URI` | Main MongoDB connection (required for transactions: use replica set) |
| `MONGODB_URI_TEST` | MongoDB for tests |
| **Auth** | |
| `JWT_SECRET` | Access token signing (must match frontend if proxy verifies) |
| `JWT_REFRESH_SECRET` | Refresh token signing |
| `JWT_ACCESS_EXPIRATION` | Access token TTL (e.g. 60m) |
| `JWT_REFRESH_EXPIRATION` | Refresh token TTL (e.g. 7d) |
| `JWT_COOKIE_EXPIRES_IN` | Cookie max-age in days |
| **URLs** | |
| `FRONTEND_URL` | Client app origin (links in emails, redirects). Same as CORS in typical setup. |
| `CORS_ORIGIN` | Allowed origin for CORS. Usually same as FRONTEND_URL. |
| `API_URL` | This backend’s public base URL (e.g. payment callbacks). |
| `WEBSITE_URL` | Optional. Public site for support/kb links; defaults to FRONTEND_URL. |
| `CONTROL_PANEL_PROTOCOL` / `CONTROL_PANEL_PORT` | cPanel URL in hosting emails (default https:2083). |
| `COMPANY_NAME` / `SUPPORT_EMAIL` | Brand in emails. |
| **Auth mode** | |
| `COOKIE_ONLY_AUTH` | true = cookies only; false = tokens in body. |
| **Rate limit** | |
| `RATE_LIMIT_WINDOW_MS` | Window length (ms). |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window. |
| **Upload / ClamAV** | |
| `MAX_FILE_SIZE` / `UPLOAD_PATH` | Upload config. |
| `ENABLE_CLAMAV_SCAN` / `CLAMAV_HOST` / `CLAMAV_PORT` | Virus scan. |
| **Email** | SMTP, `EMAIL_FROM`, `EMAIL_LOGO_URL`, `EMAIL_LOGO_INLINE` (default on: embed logo as CID for reliable rendering). |
| **Security** | `BCRYPT_SALT_ROUNDS`. |
| **Integrations** | Google, Dynadot, Namely, SSLCommerz, WHMCS (see .env.example). |

## Frontend

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend origin (proxy target, rewrites, CSP). |
| `NEXT_PUBLIC_FRONTEND_URL` | This app’s origin (SSR full URLs). `NEXT_PUBLIC_APP_URL` still supported. |
| `NEXT_PUBLIC_API_TIMEOUT` | Request timeout (ms). |
| `JWT_SECRET` | Must match backend if middleware verifies JWT. |
| `JWT_EXPIRES_IN` / `REFRESH_TOKEN_EXPIRES_IN` | Display/validation only. |
| `COOKIE_DOMAIN` / `COOKIE_SECURE` / `COOKIE_SAME_SITE` | Cookie options. |
| `BCRYPT_ROUNDS` / `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_DURATION` | Client-side auth behaviour. |
| `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX_REQUESTS` | Client-side rate limit. |

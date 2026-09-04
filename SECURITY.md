# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | ✅ Yes    |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security vulnerabilities privately by emailing the maintainer.
Expect acknowledgement within **48 hours** and a fix timeline within **7 days** for critical issues.

---

## Security Architecture

### Authentication

| Control | Implementation |
|--------|----------------|
| Password hashing | `bcrypt` (cost factor 12) |
| PIN hashing | `scrypt` with per-user 32-byte random salt |
| JWT signing | HS256, `ACCESS_TOKEN_SECRET` & `REFRESH_TOKEN_SECRET` via env |
| Refresh token storage | Hashed (SHA-256) in MongoDB; revoked on rotation |
| Refresh token transport | **HttpOnly** cookie; `Secure` + `SameSite` resolved per deployment (see below) |
| Session revocation | DB-backed token family revocation on reset / logout |
| Rate limiting | 20 req / 60s IP-based on all auth endpoints |

### Authorization

- **RBAC** enforced server-side on every route via `auth.middleware.ts`
- Roles: `OWNER` → `MANAGER` → `CASHIER` → `WAITER`
- Waiters can only view their own orders
- Paid order cancellation requires `MANAGER` or `OWNER` role
- Socket.IO rooms protected by JWT handshake + role check

### Financial Integrity

- All monetary values stored as **integer minor units** (e.g., cents)
- Server-side pricing: client-supplied unit prices are **always ignored**
- Payment idempotency: atomic `updateMany` with `isPaid: false` guard
- Paid order cancellation sets `isPaid: false` to reverse revenue metrics

### Data Transport

- All API responses use `helmet` security headers
- CORS policy is strictly allow-listed — never `origin: '*'` — via `WEB_APP_URL` and `CORS_EXTRA_ORIGINS` (alias `EXTRA_CORS_ORIGINS`) env variables. `credentials: true` is always on.
- Refresh cookies are set and cleared with identical attributes (`path=/`, `HttpOnly`, matching `Secure`/`SameSite`) so browsers reliably store and delete them.
- `Secure` flag follows the real browser-facing protocol (direct TLS or `X-Forwarded-Proto: https` from the nginx proxy). Over plain HTTP the flag is omitted — marking it Secure on an HTTP deployment makes browsers silently drop the cookie and log users out on every page refresh.
- `SameSite=None` is used **only** when the SPA and API are on different sites (browser `Origin` ≠ `Host`), because cross-site credentialed requests require it — and None is only ever emitted together with `Secure`. Same-origin and same-site deployments stay on `SameSite=Lax`, the least permissive option that works.
- Unusual topologies can force values with env overrides: `COOKIE_SECURE=true|false` and `COOKIE_SAME_SITE=strict|lax|none`.

### Infrastructure

- Docker containers run as **non-root users**
- MongoDB port bound to **loopback only** (127.0.0.1) in production
- API port bound to loopback only — Nginx reverse-proxies inbound traffic
- All containers have memory and CPU resource limits
- `read_only: true` filesystem with explicit `tmpfs` mounts
- `no-new-privileges:true` security option on all containers

### Audit Logging

Every sensitive action is recorded in the `AuditLog` collection:

| Event | Fields |
|-------|--------|
| `ORDER_PAID` | actorId, paymentMethod, totalAmount |
| `ORDER_CANCELLED` | actorId, reason, wasPaid |
| `USER_RESET_PIN` | actorId, targetId |
| `USER_RESET_PASSWORD` | actorId, targetId |

Audit logs are **append-only** and actor orphan-safe.

---

## Known Limitations

- Timezone hardcoded to UTC+3 (East Africa Time). Use a proper timezone library and store it in `SystemSetting` for multi-timezone deployments.
- MongoDB does not have authentication in the default `docker-compose.yml`. Add `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` and update `DATABASE_URL` before deploying to any public network.

---

## Dependency Security

```bash
cd backend && npm audit --audit-level=high
cd frontend && npm audit --audit-level=high
```

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
| Refresh token transport | **HttpOnly, Secure, SameSite=Strict** cookie |
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
- CORS policy is strictly allow-listed via `CORS_ORIGIN` env variable
- Refresh cookies use `Secure` flag (enforced in `NODE_ENV=production`)

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

# CMS

A robust, full-stack CMS designed for cafes and restaurants. Built with MongoDB, Express, React (Vite), and Node.js.

## Features

- **Role-Based Access Control (RBAC)**: Owner, Manager, Cashier, and Waiter roles with strict API boundaries.
- **Order State Machine**: Strict transitions (`SUBMITTED` -> `IN_KITCHEN` -> `SERVED` -> `PAID`), preventing race conditions.
- **ESC/POS Printing**: Raw byte generation for kitchen and receipt thermal printers.
- **Security First**: PIN lockout persistence, refresh token rotation with reuse detection, and strict rate limits.
- **Observability**: Request ID threading via Pino, Prometheus metrics, and Sentry error tracking.

## Architecture

- **Frontend**: React 18, Vite, TailwindCSS, Lucide Icons, Axios.
- **Backend**: Node.js, Express, Prisma ORM, MongoDB.
- **Database**: MongoDB 7.0 running in Docker.

## MongoDB Configuration

### Development (Standalone Mode)
For local development, MongoDB runs in standalone mode (single instance). The application automatically detects this and uses sequential operations with optimistic locking instead of transactions.

### Production (Replica Set Required)
For production deployments, **MongoDB must be configured as a replica set** to support multi-document transactions. The application uses transactions for:
- Settlement recording (creating settlement + updating order atomically)
- Cancellation approval (updating request + cancelling order atomically)

**Setting up a MongoDB Replica Set:**
```bash
# Initialize replica set in your MongoDB container
docker exec -it <mongo-container> mongosh
> rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "localhost:27017" }]
  })
```

The application will automatically detect replica set support at startup and log the transaction mode:
- `✓ MongoDB transaction support detected (replica set mode)` - Full ACID transactions enabled
- `MongoDB transactions NOT supported (standalone mode)` - Sequential operations with optimistic locking

Both modes maintain data consistency, but replica set mode provides stronger atomicity guarantees.

## Getting Started

1. Ensure Docker and Docker Compose are installed.
2. Clone the repository.
3. Run `docker compose up -d`.
4. Access the frontend at `http://localhost`.
5. Access the API documentation at `http://localhost:5001/api/docs`.



## Environment Variables

### Backend (`backend/.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | API port | `5001` |
| `DATABASE_URL` | MongoDB connection string (replica set in production) | `mongodb://localhost:27017/pos_db` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Access / refresh token signing secrets — **required** in production | — |
| `WEB_APP_URL` | Exact frontend origin for CORS allow-list (no trailing slash). Must match the deployed frontend URL exactly in cross-origin deployments. | `http://localhost:5173` |
| `CORS_EXTRA_ORIGINS` (alias `EXTRA_CORS_ORIGINS`) | Comma-separated extra allowed origins | — |
| `NODE_ENV` | `production` enables Secure/None cookies over HTTPS | `development` |
| `COOKIE_SAME_SITE` | Force cookie SameSite: `strict` \| `lax` \| `none` (overrides auto-detection) | auto: `none` cross-site, else `lax` |
| `COOKIE_SECURE` | Force cookie Secure flag: `true` \| `false` (overrides protocol detection) | auto: HTTPS only |

**How the refresh cookie flags are chosen (least permissive that works):**

- `Secure` is set only when the browser-facing connection is HTTPS (direct TLS or `X-Forwarded-Proto: https` from nginx). On plain-HTTP deployments the flag is omitted — a `Secure` cookie over HTTP is silently dropped by browsers, which logs users out on every page refresh.
- `SameSite=None` is used only when the SPA and API are on **different sites** (browser `Origin` host differs from the API `Host`), because cross-site credentialed requests require it. Same-origin/same-site deployments keep `SameSite=Lax`. `SameSite=None` is never emitted without `Secure`.

### Frontend (`frontend/.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_URL` | API base origin when the frontend is hosted separately (e.g. Vercel SPA + hosted API). Leave unset in the nginx/docker deployment where `/api` is proxied same-origin. | `/api` (same-origin proxy) |

## Documentation

See the [Runbook](./Runbook.md) for testing, deployment, and emergency procedures.

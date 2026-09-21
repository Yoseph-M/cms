# Operational Runbook

## Services

| Service | Port | Purpose |
|---------|------|---------|
| mongo | 27017 (loopback) | MongoDB replica set |
| api | 5001 (loopback) | Express/Node backend |
| web | 80, 443 | Nginx SPA + reverse proxy |

---

## Starting / Stopping

```bash
# Start all services
docker compose up -d

# Stop all services (data preserved)
docker compose down

# Full tear-down including volumes (DESTROYS DATA)
docker compose down -v
```

## Viewing Logs

```bash
docker compose logs -f api        # Backend logs (Pino JSON)
docker compose logs -f mongo      # MongoDB logs
docker compose logs -f web        # Nginx access/error logs
```

## Health Checks

```bash
# API health
curl http://localhost:5001/api/health

# MongoDB replica set status
docker exec mern_pos_mongo mongosh --eval "rs.status()"
```

---

## Database Operations

### Backup

```bash
docker exec mern_pos_mongo mongodump \
  --db pos_db \
  --out /data/backup/$(date +%Y%m%d_%H%M%S)
```

### Restore

```bash
docker exec mern_pos_mongo mongorestore \
  --db pos_db \
  /data/backup/<timestamp>/pos_db
```

### Create the first owner (empty database)

No staff accounts are seeded — a deployment only ever contains the people the
owner creates, and nothing ships with a password written in the source. A fresh
database therefore has no way to sign in until you create its owner:

```bash
# In backend/.env, then restart the API once
BOOTSTRAP_OWNER_PASSWORD=<a-strong-password>
# optional: BOOTSTRAP_OWNER_USERNAME=owner  BOOTSTRAP_OWNER_NAME="…"  BOOTSTRAP_OWNER_PHONE="+251…"
```

The owner is created only when no owner exists yet. **Remove
`BOOTSTRAP_OWNER_PASSWORD` once you have signed in** and change the password
from the Profile page. Every other account (managers, cashiers, waiters,
kitchen staff) is created from the Staff page.

### Run Prisma migrations

```bash
docker exec mern_pos_api npx prisma db push
```

---

## Common Incidents

### API container restarting

1. `docker compose logs api` — check for startup errors
2. Verify all required env vars are set in `./backend/.env`
3. Confirm MongoDB replica set is healthy: `docker compose ps mongo`

### Printer not responding

1. Check `printer:failed` events in the Socket.IO dashboard
2. Verify the printer IP/port in `PrinterStation` collection
3. Test TCP connectivity: `nc -zv <printer-ip> 9100`
4. Check `notification.service` for `PRINTER_FAILURE` notifications

### Offline orders not syncing

1. Check browser console for IndexedDB errors
2. Verify network connectivity (`navigator.onLine`)
3. The sync retries automatically when the browser comes back online
4. Check `offlineSyncStore.ts` → `processSyncQueue` for manual trigger

### Auth token expired mid-session

- Access tokens expire after 15 minutes; the Axios interceptor auto-refreshes via the `refresh_token` HttpOnly cookie
- If the refresh cookie is expired (7 days), the user will be redirected to login

---

## Secret Rotation

### Rotate JWT secrets

1. Update `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` in `./backend/.env`
2. Restart the API: `docker compose restart api`
3. All existing refresh tokens become invalid — users must log in again

### Reset a staff member's PIN

The PIN is the mobile-app credential — exactly 4 digits. Waiters, cooks and
baristas use it on its own; managers keep their website password as well. Set or
replace it from the staff card:

**Owner / Manager UI:** Staff → pencil on the person → *PIN (mobile app)* → save.

```bash
# Or straight through the API (Owner/Manager auth required):
curl -X PATCH http://localhost:5001/api/users/<userId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"pinCode":"1234"}'

# App sign-in: POST /api/auth/pin-login { userId, pinCode }
# Five wrong PINs lock the account for 15 minutes, exactly like a password.
```

Leaving the PIN field blank keeps the current one. PINs set before this
credential was reintroduced (the old scrypt `pinCodeHash`/`pinSalt` documents)
are not verified any more — give those staff a new PIN once from the staff card.

---

## Monitoring

- **Prometheus** metrics: `GET /api/metrics` (restrict access to internal network)
- **Sentry** errors: configured via `SENTRY_DSN` env variable
- **Pino** structured JSON logs: pipe to your log aggregator (e.g., Loki, Datadog)

```bash
# Pretty-print Pino logs locally
docker compose logs -f api | npx pino-pretty
```

---

## Scaling Notes

- The API is stateless — horizontal scaling behind a load balancer is safe
- Socket.IO requires sticky sessions OR a Redis adapter for multi-instance deployments
- MongoDB replica set must remain at minimum 1 primary + 1 secondary for ACID transactions

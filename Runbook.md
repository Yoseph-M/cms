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

```bash
# Via the Owner UI: Staff → select user → Reset PIN
# Via API (Owner/Manager auth required):
curl -X POST http://localhost:5001/api/users/<userId>/reset-pin \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"pinCode":"XXXX"}'
```

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

# MERN POS System Runbook

This runbook outlines standard operating procedures for the Point of Sale system.

## 1. Local Development

Start the full stack via Docker Compose:
```bash
docker compose up -d
```
Access the application at `http://localhost:80`.
The API is available at `http://localhost:5001`.

## 2. Testing & Quality Assurance

### Backend Tests
```bash
cd backend
npm install
npx prisma generate
npm test
```

### Frontend Tests
```bash
cd frontend
npm install
npm run test
```

### E2E Tests (Playwright)
```bash
cd e2e
npm install
npx playwright test
```

## 3. Operations

### Metrics & Health
- **Health Check**: `http://localhost:5001/api/health`
- **Prometheus Metrics**: `http://localhost:5001/api/metrics`

### Logs
Logs are output in Pino JSON format. In development, `pino-pretty` formats them for readability. All log entries include `reqId` for distributed tracing.

### Error Tracking
Sentry is configured to capture unhandled exceptions automatically. Ensure `SENTRY_DSN` is set in the `.env` file for the backend.

## 4. Emergency Procedures

### Database Lock/Crash
If MongoDB fails, restart the container:
```bash
docker compose restart mongo
```
Verify the data volume `mongo_data` is mounted properly.

### Rate Limiting & Auth Lockouts
Users are locked out after 5 failed PIN attempts. To unlock:
1. Manager/Owner must log in.
2. Manager sends a `POST /api/users/:id/unlock` request.
3. The user can then immediately attempt login again.

## 5. Security Protocols

- Default queries use soft deletes (`isActive: true`). Ensure admin-level reports override this explicitly if historical data is needed.
- `JWT_SECRET` and `JWT_REFRESH_SECRET` must be rotated annually or upon compromise.

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



## Documentation

See the [Runbook](./Runbook.md) for testing, deployment, and emergency procedures.

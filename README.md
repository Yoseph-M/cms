# MERN Point of Sale (POS) System

A robust, full-stack POS system designed for restaurants. Built with MongoDB, Express, React (Vite), and Node.js.

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

## Getting Started

1. Ensure Docker and Docker Compose are installed.
2. Clone the repository.
3. Run `docker compose up -d`.
4. Access the frontend at `http://localhost`.
5. Access the API documentation at `http://localhost:5001/api/docs`.

## Initial Setup

Upon the first startup, the backend automatically seeds initial staff accounts and menu items if the database is empty:
- **Owner**: `owner@pos.com` (PIN: 1111, Password: password123)
- **Manager**: `manager@pos.com` (PIN: 2222, Password: password123)
- **Cashier**: `cashier@pos.com` (PIN: 3333, Password: password123)


## Documentation

See the [Runbook](./Runbook.md) for testing, deployment, and emergency procedures.

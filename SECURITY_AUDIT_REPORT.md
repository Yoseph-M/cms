# Security Audit Report: MERN POS System

**Date:** February 2025
**Auditor:** Jules (Principal Security Engineer)
**Target System:** MERN Point of Sale (POS) & Content Management System (CMS) for Cafés/Restaurants

---

## 1. Executive Summary

A comprehensive security audit of the Point of Sale (POS) system was conducted. The target system is a full-stack MERN application (MongoDB, Express, React/Vite, Node.js) utilizing Prisma ORM.

### Overall Assessment
The codebase exhibits a strong baseline understanding of web application security principles. Notably, standard best practices such as password hashing via `bcrypt`, SHA-256 salted PIN hashing for waiters, optimistic locking for double-payment protection, and role-based access control (RBAC) are already correctly implemented.

However, several notable security issues and logic flaws were identified. These range from **High-Severity Role Escalation** to **Medium-Severity ESC/POS Command Injection** and **Sensitive Data Leakage**. Correcting these vulnerabilities will significantly harden the system against malicious insiders, rogue managers, and external attackers.

---

## 2. Security Strengths & Best Practices Already Implemented

The target system is commendable for having integrated the following security mechanics:
1. **Password Security**: Uses the industry-standard `bcrypt` library with a robust work factor (10 salt rounds) for Owner, Manager, and Cashier accounts.
2. **PIN Security**: Waiter PINs are salted and hashed using SHA-256 with user-specific salts rather than stored in plaintext. Trivial PIN codes (e.g., `'1234'`, `'0000'`) are blocked on validation.
3. **Optimistic Locking**: Double-payment race conditions are prevented at the database layer using explicit status-checking in Prisma `updateMany` queries, guaranteeing that only one concurrent request can successfully transit an order status to `PAID`.
4. **Idempotency**: Implements robust client-supplied UUID-v4-based idempotency checks on order submission, eliminating duplicate orders from background synchronization retries.
5. **CORS Hardening**: Dynamically validates incoming Origin headers against an explicit whitelist of allowed origins (`allowedOrigins`), rather than blindly reflecting wildcards (`*`).
6. **Defense-in-Depth**: General security headers are injected using `helmet`, response compression is active, and global rate limits of 1000 requests per 15 minutes are applied.

---

## 3. Vulnerability Registry

### VULN-01: Privilege / Role Escalation via `updateUser` Endpoint
* **Severity:** **High**
* **Code Location:** `backend/src/modules/users/users.controller.ts` (specifically the `updateUser` function) and `backend/src/modules/schemas.ts` (`updateUserSchema`)
* **Description:**
  While the `createUser` endpoint has strict role-matrix enforcement to prevent a `MANAGER` from creating a user with `MANAGER` or `OWNER` roles, the `updateUser` endpoint lacks equivalent validation on the role update payload.
  In `updateUser`:
  ```typescript
  const updatedUser = await prisma.user.update({
    where: { id },
    data: req.body, // req.body is validated via updateUserSchema
    // ...
  });
  ```
  And `updateUserSchema` allows sending a `role`:
  ```typescript
  export const updateUserSchema = z.object({
    name: z.string().min(2).optional(),
    role: z.nativeEnum(Role).optional(),
    // ...
  });
  ```
  If a `MANAGER` calls `PATCH /api/users/:id` on a target `WAITER` or `CASHIER`, they can pass `{ "role": "OWNER" }` or `{ "role": "MANAGER" }` in the request body. The system will process this update, elevating the target user to `OWNER` or `MANAGER` privilege.
* **Impact:** A malicious Manager can escalate any Cashier or Waiter account (or a secondary account they control) to an Owner-level account, completely bypassing the intended role hierarchy and gaining full control over the POS system (including deleting financial logs and printing configurations).
* **Remediation Recommendation:**
  Add role-matrix enforcement in `updateUser` similar to `createUser`. Prevent `MANAGER` callers from updating any user's role to `MANAGER` or `OWNER`, or from modifying the role field at all unless they are an `OWNER`.

  ```typescript
  // Inside updateUser controller:
  if (req.body.role) {
    if (callerRole === Role.MANAGER && (req.body.role === Role.MANAGER || req.body.role === Role.OWNER)) {
      return res.status(403).json({ error: 'Forbidden: Managers cannot assign Manager or Owner roles.' });
    }
  }
  ```

---

### VULN-02: ESC/POS Command Injection and Charset Corruption
* **Severity:** **Medium-High**
* **Code Location:** `backend/src/services/printer.service.ts` (specifically `buildEscPosKitchenTicket` and `sendTicketToPrinterTCP`)
* **Description:**
  The system builds raw byte streams for thermal printers over TCP. However, the order's item names, waiter names, and custom item notes are appended to the command stream using `Buffer.from(..., 'ascii')` without sanitization or stripping of escape/control characters:
  ```typescript
  if (item.notes && item.notes.trim()) {
    commands.push(...Buffer.from(`  -> Note: ${item.notes}\n`, 'ascii'));
  }
  ```
  If a waiter puts raw ESC/POS sequences (e.g., `\x1B\x69`, `\x1D\x56\x42` for paper cuts, or initialization sequences `\x1B\x40`) inside the notes field, these bytes are injected directly into the printer command buffer.
  Additionally, compiling UTF-8 menu strings (such as Ge'ez/Amharic characters widely used in Ethiopia) using `'ascii'` encoding strips the high bits, resulting in corrupted garbage output on the kitchen prints.
* **Impact:**
  - **Command Injection:** A rogue or compromised waiter account can craft malicious notes that trigger cash drawer kickouts, perform infinite paper feeds (Denial of Service), or corrupt the printer memory state.
  - **Character Corruption:** Multi-byte characters used for localized food names are corrupted, disrupting kitchen operations.
* **Remediation Recommendation:**
  1. Sanitize text fields before encoding them to ESC/POS. Strip any byte values below `0x20` (except standard formatting characters like `\n` and `\t`).
  2. Map strings using a localized/custom character set table (e.g., Code Page 858 or specific printer-supported multi-byte encodings) rather than generic `'ascii'`.

---

### VULN-03: Sensitive Data Leakage in Sentry Error Logs
* **Severity:** **Medium**
* **Code Location:** `backend/src/middleware/error.middleware.ts` (specifically inside the `errorHandler` function)
* **Description:**
  The Express global `errorHandler` automatically captures and uploads unhandled exceptions to Sentry:
  ```typescript
  export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled Express error caught.');

    if (!err.status || err.status >= 500) {
      Sentry.captureException(err);
    }
    // ...
  ```
  If an error occurs during validation (Zod errors) or during user creation/authentication (e.g., database connection issues or unique constraint failures), the raw exception object or the associated metadata is sent to Sentry. If this exception contains the original request payload (e.g. `req.body`), plaintext passwords, security PINs, and active authorization JWTs may be uploaded to external Sentry servers.
* **Impact:** High-severity exposure of customer/staff plaintext credentials (PINs, passwords, and tokens) on third-party SaaS logging servers.
* **Remediation Recommendation:**
  Implement a request scrubbing hook in Sentry's initialization to automatically redact fields like `password`, `pinCode`, `pin`, `authorization`, and `token`:
  ```typescript
  Sentry.init({
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.NODE_ENV || 'development',
    beforeSend(event) {
      // Scrub sensitive headers and body fields from error payloads
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
      }
      // Recursively delete or mask keys like 'password', 'pinCode', 'pin' in extra context
      return event;
    },
  });
  ```

---

### VULN-04: Client-Side Token Storage (XSS Vulnerability)
* **Severity:** **Medium**
* **Code Location:** `frontend/src/store/authStore.ts`
* **Description:**
  The system stores `accessToken` and `refreshToken` directly in `localStorage`:
  ```typescript
  localStorage.setItem('pos_access_token', accessToken);
  localStorage.setItem('pos_refresh_token', refreshToken);
  ```
  Unlike `HttpOnly` cookies, values in `localStorage` are fully accessible to any client-side JavaScript executing in the browser context.
* **Impact:** If the frontend is ever vulnerable to a Cross-Site Scripting (XSS) attack (such as via unsanitized menu item notes or custom toast rendering), an attacker can easily read the `accessToken` and `refreshToken` values from `localStorage`, enabling full, persistent session hijacking.
* **Remediation Recommendation:**
  Store the `refreshToken` in a secure, `HttpOnly`, `SameSite=Strict` cookie managed by the Express backend. The browser will handle appending the cookie to `/api/auth/refresh` automatically, making it inaccessible to XSS scripts. Keep the short-lived `accessToken` solely in-memory (Zustand state) rather than persisting it to disk.

---

### VULN-05: Non-Distributed Rate Limiting (In-Memory Store)
* **Severity:** **Low**
* **Code Location:** `backend/src/app.ts` and `backend/src/modules/auth/auth.routes.ts`
* **Description:**
  The application utilizes `express-rate-limit` to throttle requests on the general API and auth login routes. However, it configures these limiters using the default `MemoryStore`:
  ```typescript
  export const authRateLimitStore = new MemoryStore();
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    store: authRateLimitStore,
    // ...
  });
  ```
  In production, high-availability deployments run multiple backend server instances (e.g., containerized node apps clustered behind an Nginx load balancer or API gateway). Because `MemoryStore` holds client IP request counts in Node's local heap memory, rate limit states are not shared across instances.
* **Impact:** An attacker can easily bypass rate limits and perform automated brute-forcing or denial-of-service attacks by simply distributing their requests across the different backend instances.
* **Remediation Recommendation:**
  Replace `MemoryStore` with a centralized cache store like Redis (`rate-limit-redis`) or use database-backed IP throttling for production deployments.

---

### VULN-06: Weak Password Complexity Requirements
* **Severity:** **Low**
* **Code Location:** `backend/src/modules/schemas.ts` (specifically `createUserSchema` and `resetPasswordSchema`)
* **Description:**
  The schema for creating or resetting a password only checks for a minimum length of 6 characters:
  ```typescript
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
  ```
  There are no checks to enforce password complexity (such as uppercase characters, numbers, or special symbols).
* **Impact:** Users are free to choose highly insecure passwords (e.g. `123456`, `qwerty`), which can be cracked or brute-forced in seconds if an attacker targets the password login route.
* **Remediation Recommendation:**
  Refine the validation schema using regular expressions or specific validators to enforce a minimum secure password standard (e.g., at least 8 characters, with at least one number and one uppercase letter).

---

### VULN-07: Hardcoded Default Secret Fallback
* **Severity:** **Low**
* **Code Location:** `backend/src/config/index.ts`
* **Description:**
  The application config defines a default hardcoded secret key to fall back on if `JWT_SECRET` or `JWT_REFRESH_SECRET` environment variables are missing:
  ```typescript
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_access_secret_2026',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_2026',
  ```
* **Impact:** If an operator deploys the application in a staging or production environment and forgets to specify custom secret keys in `.env`, the system will quietly fallback to these hardcoded secrets. An attacker who knows these open-source secrets can forge arbitrary JWTs and gain instant, full administrator access.
* **Remediation Recommendation:**
  Do not provide default hardcoded secrets for production. Instead, raise a fatal startup exception if necessary security environment variables are missing:
  ```typescript
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing in production!');
  }
  ```

---

## 4. Conclusion & Action Items

The Point of Sale system features a robust structural design and incorporates several critical security elements natively. However, the identified issues—most notably the privilege escalation bug in user updates and command injection vectors in printing—pose severe risks if left unaddressed.

### Recommended Implementation Priority:
1. **Immediate**: Patch VULN-01 (Privilege Escalation on User Updates) to protect role boundaries.
2. **High**: Configure Sentry to redact plaintext password/PIN data (VULN-03) and sanitize ESC/POS printer inputs (VULN-02).
3. **Medium**: Harden frontend storage by transitioning from LocalStorage to Secure, HttpOnly Cookies (VULN-04) and enforce password complexity (VULN-06).
4. **Low**: Swap in Redis for distributed rate-limiting (VULN-05) and enforce mandatory JWT secrets at startup (VULN-07).

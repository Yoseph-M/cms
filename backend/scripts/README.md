# Backend Scripts

This directory contains utility and migration scripts for the CMS backend.

## ⚠️ Production Safety

**NEVER run these scripts directly in production without:**
1. Taking a database backup
2. Testing in staging environment first
3. Reviewing the script source code
4. Understanding the exact changes being made

## Script Classification

### 🔧 Maintenance Scripts (KEEP)
These are safe utility scripts for development/operations:

- **`verify-indexes.ts`** - Validates database indexes match schema
- **`verify-cors.ts`** - Tests CORS configuration
- **`check-user.ts`** - Checks user account status
- **`dedupe-refresh-tokens.ts`** - Removes duplicate refresh tokens
- **`generate-hash.ts`** - Generates password hashes for testing (dev only)

### 🚨 Migration Scripts (MIGRATION-ONLY)
These were used for specific schema migrations and should NOT be run again:

- **`migrate-drop-password.ts`** - Removed PIN authentication (Phase 2)
  - Status: COMPLETED
  - Do not re-run - PIN fields no longer exist
  
- **`migrate-restore-password.ts`** - Restored password authentication (Phase 2)
  - Status: COMPLETED  
  - Do not re-run - all users migrated

- **`fix-db.js`** - Fixed database inconsistencies
  - Status: LEGACY
  - Consider removal after verification

### 🔐 Password Reset Scripts (DEV-ONLY)
These reset passwords and MUST NOT be used in production:

- **`reset-cashier-pwd.ts`** - Resets cashier password to `password123`
  - ⚠️ DEV ONLY - contains hardcoded password
  - For production password resets, use the Owner/Manager UI

## Running Scripts

```bash
# From backend directory
npx tsx scripts/<script-name>.ts

# Example: Check user
npx tsx scripts/check-user.ts

# With environment
NODE_ENV=development npx tsx scripts/check-user.ts
```

## Security Notes

1. **No hardcoded credentials** - Scripts use environment variables or prompts
2. **No auto-execution** - All scripts require explicit invocation
3. **Audit logging** - Important operations should be logged
4. **No production secrets** - Never commit actual production credentials

## Cleanup History

### Removed Scripts
- `fix_pwd.js` - Removed 2026-08-14 (Phase 7) - hardcoded MongoDB connection
- `fix_pwd2.js` - Removed 2026-08-14 (Phase 7) - debugging script no longer needed

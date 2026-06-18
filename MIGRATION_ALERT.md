# MIGRATION REQUIRED: ABDM-1063 Fix

## Issue
The code was trying to update a column `permission_date_range` that didn't exist in the database:

```
error: column "permission_date_range" of relation "emr_consent_requests" does not exist
```

## Solution
Migration `040_consent_date_range.sql` has been created and pushed.

## What Changed
**File:** `backend/migrations/040_consent_date_range.sql`

This migration:
- Adds `permission_date_range` JSONB column to `emr_consent_requests`
- Adds `hiu_key_material` JSONB column to `emr_consent_requests`
- Creates GIN index on `permission_date_range` for efficient lookups

**File:** `backend/migrations/run-migrations.js`

Updated to include the new migration in the auto-run list.

## How to Apply
The migration will run automatically on the next backend startup via the `runMigrations()` function in `run-migrations.js`.

**Steps:**
1. Pull the latest changes (including this migration)
2. Restart the backend service
3. Migration will execute automatically before the app starts
4. Check logs for: `Migration applied: 040_consent_date_range.sql`

## Verification
After migration completes, verify the columns exist:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'emr_consent_requests' 
  AND column_name IN ('permission_date_range', 'hiu_key_material');
```

Expected output:
```
      column_name       | data_type
------------------------+----------
 permission_date_range  | jsonb
 hiu_key_material       | jsonb
```

## Timeline
- **Created:** 2026-06-18
- **Status:** Ready to deploy
- **No downtime required:** Adds nullable columns, backward compatible

## Related
- Fix: ABDM-1063 "Date Range given is invalid"
- Code changes: `backend/src/controllers/abdm.controller.js`, `backend/src/services/abdm.service.js`, `backend/src/routes/abdm.routes.js`
- See: `ABDM_1063_RESOLUTION_SUMMARY.md` for complete fix details

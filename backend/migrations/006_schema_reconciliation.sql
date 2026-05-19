-- Fix: migration 001 created tables with profile_id/accounts schema that
-- conflict with the real app schema in database.js (users/user_id).
-- Drop migration-001 tables; database.js recreates them correctly on startup.

-- Drop migration-001-only tables
DROP TABLE IF EXISTS healthbot_messages  CASCADE;
DROP TABLE IF EXISTS healthbot_sessions  CASCADE;
DROP TABLE IF EXISTS medicine_logs       CASCADE;
DROP TABLE IF EXISTS medicine_reminders  CASCADE;
DROP TABLE IF EXISTS medicines           CASCADE;
DROP TABLE IF EXISTS drug_interactions   CASCADE;
DROP TABLE IF EXISTS vital_thresholds    CASCADE;

-- Drop profiles/accounts + cascade to vitals, documents, timeline_events, notifications
-- (these tables will be recreated by database.js with the correct user_id schema)
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

-- Drop ABDM session tables — recreated by migration 004 with correct users FK
DROP TABLE IF EXISTS discover_sessions;
DROP TABLE IF EXISTS link_sessions;

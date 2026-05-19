-- Fix schema conflict: drop all tables that conflict with database.js schema.
-- database.js recreates vitals/documents/timeline_events/notifications with
-- the correct user_id schema on next startup.

-- Drop conflicting tables explicitly (no FK dependency assumed)
DROP TABLE IF EXISTS vitals            CASCADE;
DROP TABLE IF EXISTS documents         CASCADE;
DROP TABLE IF EXISTS timeline_events   CASCADE;
DROP TABLE IF EXISTS notifications     CASCADE;

-- Drop migration-001-only tables
DROP TABLE IF EXISTS healthbot_messages  CASCADE;
DROP TABLE IF EXISTS healthbot_sessions  CASCADE;
DROP TABLE IF EXISTS medicine_logs       CASCADE;
DROP TABLE IF EXISTS medicine_reminders  CASCADE;
DROP TABLE IF EXISTS medicines           CASCADE;
DROP TABLE IF EXISTS drug_interactions   CASCADE;
DROP TABLE IF EXISTS vital_thresholds    CASCADE;
DROP TABLE IF EXISTS profiles            CASCADE;
DROP TABLE IF EXISTS accounts            CASCADE;

-- Drop ABDM session tables (recreated by migration 004 with correct users FK)
DROP TABLE IF EXISTS discover_sessions;
DROP TABLE IF EXISTS link_sessions;

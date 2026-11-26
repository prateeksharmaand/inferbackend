-- Row Level Security for tenant isolation (defence in depth; services also filter by organization).
--
-- Model: the application's owner role bypasses RLS (system jobs, Super Admin). Every request made on behalf of a
-- customer runs inside a transaction that does
--     SELECT set_config('app.org_id', '<org uuid>', true);  SET LOCAL ROLE appgrowth_tenant;
-- so a missing organizationId filter in code still cannot read or write another organization's rows.
-- Re-run apply_tenant_rls() in a later migration after adding tenant tables.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'appgrowth_tenant') THEN
    CREATE ROLE appgrowth_tenant NOLOGIN;
  END IF;
END $$;

DO $$ BEGIN
  EXECUTE format('GRANT appgrowth_tenant TO %I', current_user);
EXCEPTION WHEN others THEN RAISE NOTICE 'grant role skipped: %', SQLERRM;
END $$;

GRANT USAGE ON SCHEMA public TO appgrowth_tenant;

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION apply_tenant_rls() RETURNS void LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
  -- Tables whose organizationId is NOT NULL are tenant-owned.
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'organizationId' AND c.is_nullable = 'NO' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO appgrowth_tenant USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org())', t.table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO appgrowth_tenant', t.table_name);
  END LOOP;
END $$;

SELECT apply_tenant_rls();

-- The organization row itself.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON organizations;
CREATE POLICY tenant_isolation ON organizations TO appgrowth_tenant USING (id = app_current_org()) WITH CHECK (id = app_current_org());
GRANT SELECT, UPDATE ON organizations TO appgrowth_tenant;

-- Shared reference data tenants may read (never write).
GRANT SELECT ON roles, permissions, role_permissions, subscription_plans, integration_providers, ai_agent_definitions,
  ai_agent_tools, automation_workflows, feature_flags TO appgrowth_tenant;
-- Users: tenants read members' profiles only through the membership join enforced in code; reads are allowed,
-- writes are not (profile changes go through the owner role in AuthService).
GRANT SELECT (id, email, name, status, "createdAt") ON users TO appgrowth_tenant;
-- Platform-level logs written from tenant requests.
GRANT INSERT ON audit_logs, notifications TO appgrowth_tenant;
GRANT SELECT, UPDATE ON notifications TO appgrowth_tenant;

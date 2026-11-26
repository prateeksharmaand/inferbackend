-- Notifications belong to a user (organization optional): tenant requests see only the current user's.


-- Notifications belong to a user (organization optional): tenants see only the current user's.
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_notifications ON notifications;
CREATE POLICY own_notifications ON notifications TO appgrowth_tenant USING ("userId" = app_current_user()) WITH CHECK ("userId" = app_current_user());
GRANT SELECT, INSERT, UPDATE ON notifications TO appgrowth_tenant;

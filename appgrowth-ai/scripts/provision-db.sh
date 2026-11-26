#!/usr/bin/env bash
# One-time: create the appgrowth role + database (and the RLS role) in the shared PostgreSQL. Prints nothing secret:
# the password is read from DATABASE_URL in the server's .env.
source "$(dirname "$0")/common.sh"
remote "set -e; PW=\$(grep '^DATABASE_URL=' .env | sed -E 's#.*//appgrowth:([^@]+)@.*#\1#')
  SUPER=\$(docker exec careerpilot-postgres-1 sh -c 'echo \$POSTGRES_USER')
  docker exec -i careerpilot-postgres-1 psql -U \$SUPER -d postgres -v ON_ERROR_STOP=1 -v pw=\"\$PW\" <<'SQL'
SELECT 'CREATE ROLE appgrowth LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='appgrowth') \gexec
ALTER ROLE appgrowth PASSWORD :'pw';
SELECT 'CREATE ROLE appgrowth_tenant NOLOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='appgrowth_tenant') \gexec
GRANT appgrowth_tenant TO appgrowth;
SELECT 'CREATE DATABASE appgrowth OWNER appgrowth' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='appgrowth') \gexec
SQL
  echo 'database ready'"

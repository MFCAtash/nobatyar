#!/bin/sh
# ساخت نقش اپلیکیشن (بدون superuser/BYPASSRLS) — فقط در اولین راه‌اندازی‌ی volume.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_pw="$APP_DB_PASSWORD" -v dbname="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', :'app_user', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'dbname', :'app_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user') \gexec
SQL

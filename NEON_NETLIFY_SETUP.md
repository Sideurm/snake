# Netlify + Supabase setup

## 1) Create schema in Supabase
Run SQL from `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/neon-schema.sql`
in Supabase SQL Editor. The schema file name is legacy, but SQL is standard Postgres and compatible with Supabase.

## 2) Netlify environment variables
Set in Netlify site settings:

- `SUPABASE_DB_URL` = Supabase Postgres connection string (prefer Transaction pooler URI)
- `SUPABASE_AUTH_JWT_SECRET` = secret for project auth tokens in this backend

Supported fallbacks:
- DB URL: `SUPABASE_DATABASE_URL`, `DATABASE_URL`, `NETLIFY_DATABASE_URL`
- JWT secret: `SUPABASE_JWT_SECRET`, `AUTH_JWT_SECRET`, `NETLIFY_AUTH_JWT_SECRET`

Optional:
- `DB_SSL_STRICT=true` to enable strict TLS cert validation (default false for broad hosting compatibility).

## 3) Deploy

Project includes:

- `netlify.toml` (functions + `/api/*` redirect)
- `package.json` with dependency `pg`
- Netlify functions in `netlify/functions/*`

## 4) API endpoints (unchanged)

All existing `/api/*` endpoints stay the same, so frontend migration is not required.

## 5) Notes

- This migration keeps current custom auth/progress/clan/room logic and moves storage to Supabase Postgres.
- If you want full Supabase Auth (GoTrue) integration, it should be done as a separate migration step.

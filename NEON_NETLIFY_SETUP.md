# Netlify + Neon setup

## 1) Create Neon DB schema
Run SQL from `/Users/illyaborodkin/PycharmProjects/PythonProject/snake-neon-field/neon-schema.sql` in your Neon SQL editor.

## 2) Netlify environment variables
Set in Netlify site settings:

- `DATABASE_URL` = Neon connection string (Postgres URI)
- `AUTH_JWT_SECRET` = long random secret string

Fallbacks also supported by code:
- `NETLIFY_DATABASE_URL`
- `NETLIFY_AUTH_JWT_SECRET`

## 3) Deploy

This repo now includes:

- `netlify.toml` (functions + `/api/*` redirect)
- `package.json` with dependency `pg`
- Netlify functions in `netlify/functions/*`

Endpoints:

- `POST /api/auth-register`
- `POST /api/auth-login`
- `POST /api/auth-update-nickname`
- `GET /api/auth-me`
- `GET /api/progress-get`
- `POST /api/progress-save`
- `GET /api/friends-list`
- `GET /api/friends-search`
- `POST /api/friends-request`
- `POST /api/friends-respond`
- `POST /api/friends-remove`
- `GET /api/clan-info`
- `GET /api/clan-list`
- `POST /api/clan-create`
- `POST /api/clan-join`
- `POST /api/clan-leave`
- `POST /api/clan-record-win`
- `POST /api/clan-mega-claim`
- `POST /api/room-create`
- `POST /api/room-join`
- `POST /api/room-leave`
- `POST /api/room-start`
- `POST /api/room-rematch`
- `POST /api/room-score`
- `POST /api/room-set-target`
- `GET /api/room-state`
- `GET /api/room-current`
- `GET /api/room-public-list`

## 4) Game behavior

- Login/register block is on the main screen.
- Registration requires nickname.
- Login supports both email and nickname.
- If cloud progress exists, it is loaded.
- If cloud is empty (new account), current local progress is uploaded to cloud.
- Progress autosync runs after game over and when tab is hidden.

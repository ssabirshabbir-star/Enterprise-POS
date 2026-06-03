# Enterprise POS Installation

## 1. Install PostgreSQL

Install PostgreSQL for Windows and create a database, for example:

```sql
CREATE DATABASE star;
```

Create or choose a PostgreSQL user with permission to connect and create tables in that database.

## 2. Configure Production Env

Create:

```text
%APPDATA%\Enterprise POS\.env.production
```

Use `.env.production.example` as the template. Prefer `DATABASE_URL`:

```text
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/star
JWT_ACCESS_SECRET=long-random-secret
JWT_REFRESH_SECRET=another-long-random-secret
BACKUP_DIR=C:\EnterprisePOSBackups
PRINTER_MODE=windows
UPDATE_PROVIDER=manual
LICENSE_PROVIDER=local-foundation
```

Do not use development passwords in production.

## 3. Run Database Setup

From the project folder or an admin maintenance shell:

```powershell
npm run db:health
npm run db:migrate
npm run db:first-run
```

Set these before `db:first-run` if no users exist:

```text
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_EMAIL=admin@example.local
SEED_ADMIN_PASSWORD=strong-password-here
SEED_ADMIN_NAME=System Administrator
```

## 4. Install the App

Run the installer from `release/`.

The app should open after install. If PostgreSQL is not ready, a first-run setup screen shows the exact database problem.

## Troubleshooting

- Blank screen: run `npm run build:css`, reinstall, and check the production env file.
- PostgreSQL not running: start the PostgreSQL service.
- Login failed after install: verify `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are set and restart the app.
- Database missing: create the database and run `npm run db:migrate`.
- Backup errors: set `BACKUP_DIR` to a writable directory.
- Update checks: set `UPDATE_LATEST_VERSION` and `UPDATE_DOWNLOAD_URL` when an update server is ready.
- Activation: use Settings > License to register the machine; connect `LICENSE_SERVER_URL` when the SaaS license server is available.

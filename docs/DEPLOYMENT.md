# Enterprise POS Deployment

## Build Commands

Run from the project root:

```powershell
npm install
npm run build
npm run package:win
```

Installer and portable artifacts are written to `release/`.

## Production Environment

Do not package or distribute a real `.env` file. Copy `.env.production.example` to a secure production env file and fill in values:

```powershell
Copy-Item .env.production.example .env.production
```

For installed builds, place the file in Electron app data:

```text
%APPDATA%\Enterprise POS\.env.production
```

Recommended production variables:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `BACKUP_DIR`
- `PRINTER_MODE`

Use long random secrets and never reuse the development password.

## Database

Enterprise POS uses PostgreSQL as the local offline database. The installer does not install PostgreSQL.

Run:

```powershell
npm run db:health
npm run db:migrate
npm run db:first-run
```

`db:first-run` creates the first admin only when the users table is empty. It never overwrites existing production users.

## Electron Production Loading

The production Electron app loads `src/renderer/index.html` from the packaged application. It does not require VS Code or a dev server.

If database startup fails, the app opens `setup.html` with a user-friendly database setup message instead of crashing silently.

## Updates and Licensing

The app includes a commercial deployment foundation:

- Version is read from `package.json` / Electron app config.
- Settings > Updates can check a provider abstraction.
- Settings > License stores a machine-bound local activation cache.
- Machine ID is generated locally and is not a secret.

Production update server variables:

```text
UPDATE_PROVIDER=manual
UPDATE_LATEST_VERSION=1.0.1
UPDATE_DOWNLOAD_URL=https://updates.example.com/enterprise-pos/1.0.1
```

Production license server variables reserved for SaaS integration:

```text
LICENSE_PROVIDER=your-license-provider
LICENSE_SERVER_URL=https://license.example.com
```

Do not put license server secrets in the frontend or packaged renderer files.

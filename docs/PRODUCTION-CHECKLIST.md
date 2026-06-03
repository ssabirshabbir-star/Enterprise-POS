# Production Checklist

## Build

- Run `npm install`
- Run `npm run build`
- Run `npm run package:win`
- Verify installer and portable app exist in `release/`
- Add a production Windows icon at `build/icon.ico` before final branding release. Current build falls back to the Electron default icon if no icon exists.

## Environment

- Real `.env` is not packaged
- `%APPDATA%\Enterprise POS\.env.production` exists
- `DATABASE_URL` or PostgreSQL variables are set
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are long random values
- `BACKUP_DIR` points to a writable folder

## Database

- PostgreSQL service is running
- Production database exists
- `npm run db:health` passes
- `npm run db:migrate` passes
- `npm run db:first-run` creates admin only when no users exist

## Security

- No development database password is used
- No secrets are committed or packaged
- Passwords are stored as bcrypt hashes only
- Admin password is changed after first login
- Restore backup remains Admin-only

## App Verification

- App opens without VS Code
- Login works
- Login footer shows the current app version
- Dashboard loads
- Product, Inventory, POS Billing, Reports, Settings, Sync routes load
- Receipt preview/printing foundation still works
- Backup and restore screens open
- Database failure opens first-run setup screen with a clear message
- Settings > About shows version, build date, environment, and sync status
- Settings > Updates can run a manual update check
- Settings > License shows machine ID and activation status

## Backup/Restore

- Create a manual backup before production use
- Store backups outside the install directory
- Test restore only on a non-production copy first

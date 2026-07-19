# Enterprise POS Installation

## 1. Install Enterprise POS

Run the offline Windows installer from `release/`.

For the managed local database flow, the installer package carries the approved PostgreSQL payload
and prerequisite metadata. The application stores its database configuration under the installed
application's user data directory after provisioning succeeds.

Shop operators should not create a `.env` file, choose PostgreSQL binaries, create PostgreSQL roles,
or enter the internal database password.

## 2. First Launch

Launch Enterprise POS from the Desktop or Start menu.

If the local managed database is not ready, the guided setup screen reports the current database
state and the blocked prerequisites. Normal login remains unavailable until database setup and
schema readiness complete.

## 3. First Administrator

Create the first business administrator only through the guided first-run application setup.

The business administrator account is separate from the internal PostgreSQL service account.
Enterprise POS must not display or ask for the internal PostgreSQL password.

## 4. Updates and Repair

Application updates and repair installs must preserve the managed database configuration, encrypted
credential, PostgreSQL data directory, users, settings, backups, and Restore governance state. They
must not silently create a new blank database.

## External PostgreSQL or Development

Developer checkouts and deliberately external PostgreSQL deployments may still use
`.env.production.example` as a shape reference. Do not put production database passwords in packaged
application resources, logs, screenshots, or support bundles.

Production Restore remains disabled unless a separate activation record and release approval
explicitly authorize it.

## Troubleshooting

- Blank screen: reinstall or repair the application and check the installer diagnostics.
- Local database setup incomplete: use the guided setup or recovery flow.
- PostgreSQL not running: use the managed database recovery flow; do not edit database secrets.
- Login failed after install: verify the business user account and activation state.
- Database missing or configuration damaged: use the guided database recovery flow.
- Backup errors: set `BACKUP_DIR` to a writable directory.
- Update checks: set `UPDATE_LATEST_VERSION` and `UPDATE_DOWNLOAD_URL` when an update server is
  ready.
- Activation: use Settings > License to register the machine; connect `LICENSE_SERVER_URL` when the
  SaaS license server is available.

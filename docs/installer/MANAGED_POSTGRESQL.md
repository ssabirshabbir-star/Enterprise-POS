# Managed PostgreSQL Installer Foundation

This phase defines the Enterprise POS Windows installer architecture for a future bundled PostgreSQL
runtime.

Production managed provisioning is intentionally blocked until clean-machine runtime certification
and release approval are both complete.

## Version Policy

- Managed PostgreSQL version: `17.10`
- Architecture: `win32-x64`
- Official archive filename: `postgresql-17.10-2-windows-x64-binaries.zip`
- Official archive SHA-256: `ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106`
- Service name: `EnterprisePOSPostgreSQL`
- Default managed port: `55432`
- Policy version: `managed-postgres-policy-v1`

Existing PostgreSQL installations are detected and classified against the same policy. Unsupported,
unknown, or newer untested major versions require an explicit future certification decision instead
of being accepted silently.

## Payload Gate

The installer expects a server-only PostgreSQL payload described by
`resources/postgres/manifest.json`.

Managed provisioning is blocked unless all of these are true:

- payload file exists in packaged resources;
- manifest version and architecture match the pinned policy;
- SHA-256 digest is configured and matches the payload;
- redistribution status is marked `certified`;
- required license and third-party notices are present.

No PostgreSQL binary is committed in this repository.

The official EnterpriseDB binary archive contains more than the Enterprise POS runtime needs. The
staging layer must extract only:

- `pgsql/bin/`
- `pgsql/lib/`
- `pgsql/share/`
- `pgsql/server_license.txt`
- `pgsql/commandlinetools_3rd_party_licenses.txt`

The staging layer must not extract:

- `pgsql/pgAdmin 4/`
- `pgsql/StackBuilder/`

The original archive remains outside Git and must not be renamed, modified, or extracted into the
repository.

## Provisioning Journal

The installer stores PostgreSQL provisioning state in the Electron `userData` directory, outside the
application database. This is required because database setup may fail before the application
database exists.

The journal records state transitions without storing passwords or full connection strings.

## Provisioning State Machine

The production provisioning architecture is serializable and resumable, but still disabled. The
authoritative staged lifecycle is:

1. `NOT_STARTED`
2. `ARCHIVE_VERIFIED`
3. `PAYLOAD_STAGED`
4. `DATA_DIRECTORY_INITIALIZED`
5. `SERVER_STARTED`
6. `DATABASE_CREATED`
7. `APPLICATION_SCHEMA_READY`
8. `COMPLETED`

Failure states are:

- `FAILED`
- `ROLLBACK_REQUIRED`
- `ROLLBACK_IN_PROGRESS`
- `ROLLED_BACK`
- `MANUAL_RECOVERY_REQUIRED`
- `CANCELLED_BEFORE_MUTATION`

Interrupted states are reconciled from the provisioning journal. The installer may resume only when
the previous stage can be verified deterministically. Ambiguous failures and interrupted rollbacks
remain blocked for manual recovery.

## Recovery and Rollback Policy

Recovery decisions are deterministic:

- verified archive state may restage the payload;
- staged payload state must re-check the staged runtime before `initdb`;
- initialized data directories must be ownership-checked before server start;
- started server state must be health-checked before database creation;
- created databases must be inspected before schema initialization;
- schema-ready state must pass health checks before completion;
- interrupted rollback and unknown states require manual review.

Rollback may remove only Enterprise POS-owned temporary staging directories, incomplete managed
runtime directories, incomplete managed data directories, and transient service registration created
by the same operation. Rollback preserves:

- the provisioning journal;
- stage logs and PostgreSQL server logs;
- the source PostgreSQL archive;
- license and notice evidence;
- user databases;
- unrelated PostgreSQL installations and services.

The installer never deletes user databases or unrelated PostgreSQL services.

## Installer Logs and Progress Contract

Provisioning events are append-only JSON Lines records in Electron `userData`. Each entry contains
timestamp, operation ID, step, duration, status, exit code, redacted command evidence, a human
message, and sanitized error details.

Installer-facing progress labels are prepared but inactive:

- Verifying PostgreSQL package
- Checking integrity
- Preparing runtime
- Initializing database
- Starting database
- Creating application database
- Preparing Enterprise POS
- Completed
- Failed

Renderer code can display these labels in the future, but it cannot choose service commands,
filesystem paths, credentials, or activation state.

## Production Readiness Report

The installer readiness assessment reports:

- `completed`: archive policy, manifest pinning, safe staging, and runtime harness;
- `pending`: clean Windows Sandbox/VM runtime certification;
- `pending`: release approval;
- `blocked`: production activation until both pending gates pass.

`provisioningActivationEnabled` remains `false`, and `certifiedForActivation` remains `false`.

## Safety Boundaries

- Renderer code cannot choose service commands or filesystem paths.
- Managed service command plans are built in the main process.
- Generated database passwords are produced with `crypto.randomBytes`.
- Credentials are stored only through the existing encrypted installer configuration store.
- Failed managed preflight cancels before mutation.
- In-progress provisioning states are recoverable through the journal before retry.
- Uninstall preserves application data by default.

## Remaining Certification Work

- Code-sign the Windows installer.
- Run Windows Sandbox or VM certification for managed provisioning, repair, upgrade, and uninstall.
- Physically certify a shop deployment before enabling managed provisioning in production.

## Runtime Certification Harness

The managed runtime certification harness exercises the selectively staged PostgreSQL runtime
without installing a Windows service or touching the application database.

Local diagnostic run:

```powershell
node scripts/certify-managed-postgres-runtime.js `
  --certify-managed-postgres-runtime `
  --archive D:\Enterprise-POS-release-inputs\postgres\postgresql-17.10-2-windows-x64-binaries.zip `
  --output test-artifacts\managed-postgres-runtime-certification
```

Clean Windows Sandbox or disposable VM run:

```powershell
node scripts/certify-managed-postgres-runtime.js `
  --certify-managed-postgres-runtime `
  --clean-environment `
  --archive D:\Enterprise-POS-release-inputs\postgres\postgresql-17.10-2-windows-x64-binaries.zip `
  --output C:\EnterprisePOSPostgresRuntimeCertification
```

The harness:

- verifies filename and SHA-256 through the committed manifest;
- reuses the production archive stager;
- extracts runtime files to a disposable directory under the system temp folder;
- creates a disposable PostgreSQL data directory;
- starts PostgreSQL with `pg_ctl.exe` bound to `127.0.0.1` on a dynamic port;
- validates `psql.exe`, `createdb.exe`, server version, SQL write/read round trip, and clean
  shutdown;
- writes `managed-postgres-runtime-certification.json` and a concise text report;
- removes temporary runtime files after success unless `--keep-on-success` is passed;
- preserves runtime directories and logs after failure for diagnostics.

The harness intentionally does not:

- create or modify Windows services;
- change the registry, firewall, global `PATH`, or global environment;
- use or stop an existing PostgreSQL service;
- connect to the Enterprise POS application database;
- enable managed provisioning.

PASS criteria require a successful report from a clean Windows Sandbox or clean disposable VM with
`--clean-environment`. A successful local development-machine run is diagnostic only and should be
reported as blocked for activation until clean-machine execution is reviewed.

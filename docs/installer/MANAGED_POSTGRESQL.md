# Managed PostgreSQL Installer Foundation

This phase defines the Enterprise POS Windows installer architecture for a future bundled PostgreSQL
runtime.

Production managed provisioning is intentionally blocked until release engineering supplies a
verified server payload.

## Version Policy

- Managed PostgreSQL version: `17.10`
- Architecture: `win32-x64`
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

## Provisioning Journal

The installer stores PostgreSQL provisioning state in the Electron `userData` directory, outside the
application database. This is required because database setup may fail before the application
database exists.

The journal records state transitions without storing passwords or full connection strings.

## Safety Boundaries

- Renderer code cannot choose service commands or filesystem paths.
- Managed service command plans are built in the main process.
- Generated database passwords are produced with `crypto.randomBytes`.
- Credentials are stored only through the existing encrypted installer configuration store.
- Failed managed preflight cancels before mutation.
- In-progress provisioning states are recoverable through the journal before retry.
- Uninstall preserves application data by default.

## Remaining Certification Work

- Supply and checksum-pin the PostgreSQL server payload.
- Complete redistribution and notice review for the selected payload.
- Code-sign the Windows installer.
- Run Windows Sandbox or VM certification for managed provisioning, repair, upgrade, and uninstall.
- Physically certify a shop deployment before enabling managed provisioning in production.

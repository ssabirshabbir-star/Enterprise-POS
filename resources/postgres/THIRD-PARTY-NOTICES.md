# Enterprise POS Managed PostgreSQL Payload Notice

No PostgreSQL binary payload is bundled in this source tree.

The managed PostgreSQL installer path is intentionally blocked until release engineering certifies
the official EnterpriseDB Windows x64 binary archive:

`D:\Enterprise-POS-release-inputs\postgres\postgresql-17.10-2-windows-x64-binaries.zip`

The archive must provide:

- exact version and architecture matching `manifest.json`;
- SHA-256 digest pinned in `manifest.json`;
- redistribution and license notice review;
- packaged VM or Windows Sandbox certification;
- Epson/shop deployment runtime certification.

The original archive must remain unchanged and outside Git. Enterprise POS staging extracts only
PostgreSQL runtime components and required notices:

- `pgsql/bin/`
- `pgsql/lib/`
- `pgsql/share/`
- `pgsql/server_license.txt`
- `pgsql/commandlinetools_3rd_party_licenses.txt`

The staging process intentionally omits pgAdmin and StackBuilder from the managed runtime.

The setup wizard may detect and use an existing PostgreSQL installation through the guided
existing-runtime path.

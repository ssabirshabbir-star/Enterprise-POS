# Enterprise POS Managed PostgreSQL Payload Notice

No PostgreSQL binary payload is bundled in this source tree.

The managed PostgreSQL installer path is intentionally blocked until release engineering supplies a
server-only Windows payload with:

- exact version and architecture matching `manifest.json`;
- SHA-256 digest pinned in `manifest.json`;
- redistribution and license notice review;
- packaged VM or Windows Sandbox certification;
- Epson/shop deployment runtime certification.

The setup wizard may detect and use an existing PostgreSQL installation through the guided
existing-runtime path.

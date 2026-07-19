# Windows Release Packaging and Signing

This document defines the Windows installer packaging, notice inclusion, artifact classification,
and code-signing readiness policy for Enterprise POS. It does not authorize production release.

## Current Decision

- Packaging readiness: defined.
- Production provisioning: disabled.
- PostgreSQL redistribution status: not approved.
- Microsoft Visual C++ Runtime redistribution status: not approved.
- Code-signing credentials: unresolved.
- Production release: blocked.

## Build Source Model

Production and release-candidate installers must be built from a clean source export, not from a
dirty developer working tree.

Required procedure:

1. Verify the intended branch and commit.
2. Export the exact commit to an isolated temporary source directory with `git archive` or an
   equivalent clean CI checkout.
3. Install dependencies from `package-lock.json`.
4. Build and package from that clean source.
5. Record Node, npm, Electron, and electron-builder versions.
6. Record build logs.
7. Inspect packaged content before release classification.
8. Sign, timestamp, verify, and then record final post-signing SHA-256 hashes.

The active developer worktree must not be cleaned or mutated to create a release source.

## Packaging Configuration

The authoritative Windows packaging command is:

```powershell
npm.cmd run package:win
```

The command runs:

```text
npm run build && electron-builder --win nsis
```

Packaging is controlled by the `build` section of `package.json`.

Current package identity:

- App ID: `com.enterprisepos.desktop`
- Product name: `Enterprise POS`
- Windows target: NSIS
- Output directory: `release`
- Installation mode: assisted NSIS, per-user by default
- Uninstall policy: `deleteAppDataOnUninstall=false`

## Included Content

The package includes:

- `src/**/*`
- `package.json`
- `.env.production.example`
- `docs`
- `resources/postgres` notice and governance files
- `resources/prerequisites` manifest and documentation files
- `resources/release` non-authorizing release evidence templates

The PostgreSQL resource filter includes JSON, Markdown, and text governance/notice files, but
excludes ZIP archives. The VC Runtime prerequisite resource filter includes manifests and
documentation, but excludes executables.

## Prohibited Content

Production and release-candidate packages must not include:

- `.git`
- `.env`, `.env.local`, or real `.env.production`
- credentials, private keys, certificate passwords, signing tokens, PFX/P12/PEM/KEY files
- PostgreSQL ZIP payloads before redistribution approval
- unpacked PostgreSQL runtime binaries before redistribution approval
- `vc_redist.x64.exe` before redistribution approval
- `test-artifacts`
- Sandbox evidence, screenshots, runtime logs, database clusters, or generated credentials
- source maps unless separately approved
- update metadata that was generated before final signing

## License and Notice Inclusion

Required packaged notice/governance paths include:

- `resources/postgres/POSTGRESQL-LICENSE.txt`
- `resources/postgres/THIRD-PARTY-NOTICES.md`
- `resources/postgres/redistribution-manifest.json`
- `resources/postgres/release-authorization.pending.json`
- `resources/prerequisites/microsoft-vc-runtime/manifest.json`
- `docs/installer/MICROSOFT_VC_RUNTIME_PREREQUISITE.md`
- `docs/installer/MANAGED_POSTGRESQL_RELEASE_GOVERNANCE.md`

The PostgreSQL archive-internal files `pgsql/server_license.txt` and
`pgsql/commandlinetools_3rd_party_licenses.txt` must also accompany a future approved staged
PostgreSQL runtime. They are not currently embedded because the PostgreSQL ZIP is not embedded in
the normal production package.

## Hybrid PostgreSQL Payload Model

The current recommended model is hybrid:

- normal production source packages include manifests, notices, and non-authorizing governance
  files;
- external PostgreSQL and VC Runtime payloads remain outside Git;
- future production release artifacts may embed exact-hash approved payloads only after legal,
  security, and release authorization;
- network download is disabled until a separate download provenance, retry, proxy, cache, and
  cleanup design is approved.

## Code-Signing Policy

Development builds may be unsigned, but they must remain development or certification artifacts.

Production release requirements:

- the final NSIS installer must be Authenticode signed;
- installed application executables and required nested executable artifacts must be signed;
- signatures must use SHA-256 and trusted timestamping;
- publisher subject must match the approved release authority;
- timestamp validation must pass;
- certificate chain validation must pass;
- partial signing is a release blocker;
- unsigned artifacts must not be renamed or published as production releases;
- re-signing or rebuilding invalidates final artifact hashes;
- certificate renewal or replacement requires a governance update.

An EV certificate may improve reputation establishment, but it is not documented here as a strict
requirement and must not be described as eliminating all SmartScreen warnings.

## Signing Verification

Where Windows signing tools are available, release evidence must verify every executable artifact
using one or more of:

- `Get-AuthenticodeSignature`
- `signtool verify`
- certificate chain validation
- timestamp validation
- publisher subject validation
- recursive executable inventory of installer and unpacked application content

Verification must classify:

- valid signed artifact;
- unsigned artifact;
- invalid signature;
- untrusted chain;
- missing timestamp;
- expired certificate without valid timestamp;
- wrong publisher;
- partial signing;
- signature changed after signing.

Signing the outer installer alone is not sufficient when nested executable artifacts are unsigned.

## Artifact Naming and Classification

Non-production artifacts must include a visible classification such as:

- `development`
- `certification`
- `release-candidate`

Production-looking artifact names are allowed only after signing, final hash capture, notice
inspection, release authorization, and explicit owner approval. Unsigned certification builds must
not be presented as production releases.

## Hashing Point

Authoritative SHA-256 hashes must be recorded after the final artifact mutation:

1. compile;
2. package;
3. sign nested executables;
4. sign installer;
5. timestamp;
6. verify signatures;
7. record final hashes.

Pre-signing hashes are diagnostic only.

Required hash evidence:

- final installer;
- unpacked/portable artifacts, if released;
- update package and metadata, if released;
- external PostgreSQL payload;
- external VC Runtime payload;
- release authorization record;
- redistribution manifest;
- consolidated notices/evidence file.

## Release Evidence Manifest

The pending evidence template is:

`resources/release/windows-release-evidence.pending.json`

It is non-authorizing and must not be used as release approval. Authorization remains separate in
`resources/postgres/release-authorization.pending.json`.

## Production Release Gate

A production release must fail closed unless all are true:

- build source is the approved Git commit;
- required tests pass;
- packaging audit passes;
- no prohibited files are included;
- required notices are included;
- PostgreSQL redistribution manifest is valid;
- authentic PostgreSQL and VC Runtime release authorization exists;
- exact payload hashes are approved;
- production provisioning authorization is valid;
- final installer and required nested executables are signed;
- timestamp and publisher verification pass;
- final post-signing hashes are recorded;
- secret scan passes;
- release evidence manifest is complete;
- certificate identity is approved and not revoked;
- release channel is explicitly production;
- explicit owner/release approval exists.

Unknown, absent, malformed, expired, revoked, partial, or mismatched evidence blocks production.

## Emergency Release Handling

Security-driven emergency releases may be expedited, but they must still produce:

- immutable payload identity;
- notice and license evidence;
- technical validation;
- signing verification;
- final post-signing hashes;
- release authorization.

PostgreSQL major-version upgrades are out of scope for automatic release. They require a separate
data migration, backup, rollback, and compatibility certification plan.

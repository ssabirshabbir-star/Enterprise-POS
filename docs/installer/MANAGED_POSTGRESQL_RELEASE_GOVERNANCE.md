# Managed PostgreSQL Release Governance

This report covers release authorization and redistribution governance for the Enterprise POS
managed PostgreSQL installer path. It does not enable production provisioning.

Windows package signing, artifact classification, and post-signing hash capture are defined in
`docs/installer/WINDOWS_RELEASE_PACKAGING_AND_SIGNING.md`.

## Current Decision

- Technical provisioning certification: complete for the current evidence set.
- PostgreSQL redistribution approval: unresolved.
- Microsoft Visual C++ Runtime redistribution approval: unresolved.
- Security release approval: unresolved.
- Production enablement: blocked.

Production provisioning remains disabled until an authentic release authorization record is present
and all production gates pass.

## Files Inspected

- `src/main/installer/postgres-payload-verifier.js`
- `src/main/installer/postgres-provisioning.service.js`
- `src/main/installer/postgres-provisioning.model.js`
- `src/main/installer/vc-runtime-prerequisite.service.js`
- `resources/postgres/manifest.json`
- `resources/postgres/POSTGRESQL-LICENSE.txt`
- `resources/postgres/THIRD-PARTY-NOTICES.md`
- `resources/prerequisites/microsoft-vc-runtime/manifest.json`
- `docs/installer/MANAGED_POSTGRESQL.md`
- `docs/installer/MICROSOFT_VC_RUNTIME_PREREQUISITE.md`
- `package.json`
- managed PostgreSQL installer tests under `tests/`

## Dependency Map

- PostgreSQL payload identity is defined in `resources/postgres/manifest.json`.
- PostgreSQL payload integrity and notice checks are enforced by
  `src/main/installer/postgres-payload-verifier.js`.
- Microsoft Visual C++ Runtime identity, hash, signer, and installer exit-code policy are defined in
  `resources/prerequisites/microsoft-vc-runtime/manifest.json`.
- Microsoft Visual C++ Runtime verification and installation classification are enforced by
  `src/main/installer/vc-runtime-prerequisite.service.js`.
- Production managed provisioning is blocked in
  `src/main/installer/postgres-provisioning.service.js`.
- Production readiness remains false in `src/main/installer/postgres-provisioning.model.js`.
- Release authorization is represented by `resources/postgres/release-authorization.pending.json`
  and validated by `src/main/installer/postgres-release-authorization.js`.
- Redistribution and packaging metadata is represented by
  `resources/postgres/redistribution-manifest.json`.

## PostgreSQL Redistribution Finding

The authoritative technical payload remains:

- Version: PostgreSQL `17.10`
- Architecture: `win32-x64`
- Filename: `postgresql-17.10-2-windows-x64-binaries.zip`
- SHA-256: `ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106`
- Source class: EDB Windows x64 binary archive for PostgreSQL 17.10

The intended redistributed PostgreSQL runtime is the filtered staged subset:

- `pgsql/bin/`
- `pgsql/lib/`
- `pgsql/share/`
- `pgsql/server_license.txt`
- `pgsql/commandlinetools_3rd_party_licenses.txt`

The packaging policy excludes `pgsql/pgAdmin 4/`, `pgsql/StackBuilder/`, and other unnecessary
tooling.

PostgreSQL's license is permissive and the repository includes the PostgreSQL license text and
third-party notice references. This is technical license-document evidence, not legal approval.
Release/legal approval remains required before production redistribution.

## Microsoft VC Runtime Redistribution Finding

The authoritative prerequisite payload remains:

- Product: Microsoft Visual C++ Redistributable 2015-2022 x64
- Filename: `vc_redist.x64.exe`
- Pinned version: `14.51.36247.0`
- SHA-256: `843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c`
- Expected signer: `Microsoft Corporation`
- Install arguments: `/install /passive /norestart`

The normal production package does not commit or embed the `.exe` while redistribution approval is
pending. Certification builds may consume the executable as an external release input after hash and
signature verification. Microsoft redistribution/license review remains required before bundling
this payload into production release artifacts.

## Packaging Model Assessment

### Model A - Embedded Offline Payload

Benefits:

- Fully offline shop deployment.
- Reproducible release artifact when payload hashes are pinned.
- No dependency on vendor site availability during installation.

Costs and risks:

- Larger installer.
- Enterprise POS becomes responsible for tracking payload provenance, notices, and security updates.
- Every payload update requires a new release review and certification pass.

### Model B - Verified Download During Installation

Benefits:

- Smaller installer.
- Vendor-hosted payload can be refreshed independently.

Costs and risks:

- Internet dependency is poor for offline retail/POS deployments.
- Proxy/firewall and vendor availability can block shop installation.
- Mutable URLs cannot be the only integrity guarantee; hashes and pinned versions are still
  required.

### Model C - Hybrid

Recommended model:

- Production release may embed approved, exact-hash external payloads after authorization.
- Certification and maintenance tooling may continue to accept externally supplied pinned payloads.
- Network download remains disabled unless a future release designs and certifies download
  provenance, retry, proxy, cache, and cleanup behavior.

This matches the current architecture best because the installer already supports external release
inputs for certification and excludes unapproved binaries from Git.

The offline certification packaging path now copies exact verified external inputs into a clean
build export immediately before packaging. The normal development installer continues to exclude the
PostgreSQL ZIP and VC Runtime EXE payloads.

## Required Notices

Production packaging must preserve:

- `resources/postgres/POSTGRESQL-LICENSE.txt`
- `resources/postgres/THIRD-PARTY-NOTICES.md`
- `pgsql/server_license.txt` from the PostgreSQL archive
- `pgsql/commandlinetools_3rd_party_licenses.txt` from the PostgreSQL archive
- `resources/prerequisites/microsoft-vc-runtime/manifest.json`
- `docs/installer/MICROSOFT_VC_RUNTIME_PREREQUISITE.md`
- a consolidated third-party notice location available from documentation or an application About /
  legal screen before release approval

No unverified legal text should be copied from unofficial sources.

## Production Enablement Gate

Production managed PostgreSQL provisioning must require all of the following:

- PostgreSQL version, architecture, filename, and SHA-256 match the pinned manifest.
- Required PostgreSQL license and notice files exist.
- `redistributionStatus` is explicitly approved in the payload manifest.
- Release authorization record is present, approved, unexpired, not revoked, and scoped to
  `enterprise-pos-managed-postgres-production`.
- Authorization record matches the PostgreSQL and VC Runtime hashes and filenames.
- Authorization record matches the canonical PostgreSQL payload manifest hash.
- Authorization record includes immutable technical certification evidence identity.
- Legal review status is approved.
- Security review status is approved.
- Release approval status is approved.
- Packaging model is explicitly selected.
- Provisioning strategy is explicitly approved as `extract-and-provision-dedicated-cluster`.
- Installer version scope is explicit and includes the current installer version.
- VC Runtime policy is approved and verified.
- Production feature flag is enabled by a future authorized change.
- No certification blockers, stale provisioning operations, recovery-required states, unsafe roots,
  unsafe database names, development overrides, or test-only approvals are active.

The default state is fail-closed. A manifest marked approved without a valid authorization record is
not enough.

## Authorization Record

The pending template is:

`resources/postgres/release-authorization.pending.json`

It is intentionally non-authorizing. A real approval must replace the pending fields with documented
legal, security, and release decisions. The validator rejects:

- unknown schema versions;
- missing fields;
- pending, expired, revoked, or test-only approvals;
- wrong release scope;
- mismatched PostgreSQL version, architecture, filename, or SHA-256;
- mismatched PostgreSQL payload manifest hash;
- mismatched VC Runtime filename, architecture, or SHA-256;
- missing or malformed technical certification evidence hash;
- missing release approval;
- mismatched provisioning strategy;
- installer versions outside the approved release scope;
- unresolved approver identity;
- expired approval timestamps.

No approval record has been provided in this phase.

## Update and Security Policy

- Application updates must not silently replace PostgreSQL runtime binaries.
- PostgreSQL patch updates require a new official payload, SHA-256 pin, notice audit, technical
  certification, security review, and release authorization.
- PostgreSQL major upgrades require an explicit migration strategy and backup requirement before
  opening existing customer data directories.
- Downgrades are blocked unless separately designed and certified.
- VC Runtime updates require Microsoft provenance, hash pinning, signature verification, technical
  certification, and release approval.
- Emergency security releases may be expedited but must still produce immutable payload identity,
  notice, technical validation, and approval records.
- Existing customer data must be backed up before any future managed runtime upgrade.

## Remaining Blockers

- Legal/release authority is unresolved.
- PostgreSQL redistribution approval is unresolved.
- Microsoft VC Runtime redistribution approval is unresolved.
- Code signing remains outside this report.
- Code signing remains unresolved and is governed by
  `docs/installer/WINDOWS_RELEASE_PACKAGING_AND_SIGNING.md`.
- Production feature enablement remains intentionally absent.
- A consolidated in-app About/legal notice surface is still a release-readiness item.

## Production Enablement Decision

PASS - governance architecture complete, production still blocked.

This decision means the repository now has a fail-closed authorization boundary and pending
governance records. It does not authorize production provisioning or redistribution.

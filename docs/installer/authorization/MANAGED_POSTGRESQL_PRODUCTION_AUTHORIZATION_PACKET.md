# Managed PostgreSQL Production Provisioning Authorization Packet

This packet is review evidence for a future authorization decision. It is not legal approval,
security approval, release approval, redistribution certification, or production activation.

## 1. Executive Decision Summary

The proposed authorization would allow the Enterprise POS offline Windows installer to provision a
local, installer-managed PostgreSQL database for shop deployments without requiring the operator to
create or edit a `.env` file.

The exact payload proposed for review is PostgreSQL 17.10 for Windows x86-64:

- Archive: `postgresql-17.10-2-windows-x64-binaries.zip`
- SHA-256: `EF9B1E5E23D2E8A83914BA13D9DC536A72210FBA53FD1808FF1F7E06BB22B106`
- Provisioning strategy: `extract-and-provision-dedicated-cluster`

The requested installer scope is the Enterprise POS offline Windows x86-64 installer only. It does
not cover cloud, web, mobile, server-hosted deployments, PostgreSQL major upgrades, or Production
Restore.

What remains disabled now:

- Production managed PostgreSQL provisioning.
- PostgreSQL `redistributionStatus`, which remains `not-certified`.
- The pending PostgreSQL release authorization record, which remains non-authorizing.
- Production Restore.
- Production feature flags.

Approval is required because the application would redistribute and execute third-party runtime
components as part of a customer/shop installation. Technical certification has already covered the
managed PostgreSQL happy path, failure matrix, VC++ Runtime prerequisite handling, managed database
configuration, startup without `.env` at code level, and Restore boundary regressions. The clean
production-gated packaged lifecycle still remains blocked until authentic approval exists.

Reviewers must decide whether to authorize one of the decision options in Section 12. Technical
readiness, redistribution/legal acceptance, security acceptance, release authorization, and final
packaged lifecycle certification are separate decisions.

## 2. Exact Payload Identity

- Product name: PostgreSQL server runtime.
- PostgreSQL version: `17.10`.
- Architecture: Windows x86-64, represented in the application manifest as `win32-x64`.
- Official archive filename: `postgresql-17.10-2-windows-x64-binaries.zip`.
- Expected archive size: `333927270` bytes, from
  `D:\Enterprise-POS-release-inputs\postgres\postgresql-17.10-2-windows-x64-binaries.zip`.
- Archive SHA-256: `EF9B1E5E23D2E8A83914BA13D9DC536A72210FBA53FD1808FF1F7E06BB22B106`.
- Payload manifest path: `resources/postgres/manifest.json`.
- Payload manifest file SHA-256: `FF66DFF3E83796DFBE5BF415C9E6CDA00BC0189BA1953340680E659D60CF74D0`.
- Canonical payload manifest SHA-256:
  `6BA68D44792715E0DCF8B2B375129A6E1C77AD36192D6FF3C2F9423CD63B78A0`.
- PostgreSQL license file: `resources/postgres/POSTGRESQL-LICENSE.txt`.
- PostgreSQL license SHA-256: `A85560CFBB82C06A52AA59710A8BE4C847924E313179F992038283606F7F33C4`.
- Third-party notices path: `resources/postgres/THIRD-PARTY-NOTICES.md`.
- Third-party notices SHA-256: `CCEE01C42531C1F867AD1686C897BD9840379580A3ACEA0873ACED1408C959CE`.

Included required executables:

- `pgsql/bin/postgres.exe`
- `pgsql/bin/initdb.exe`
- `pgsql/bin/pg_ctl.exe`
- `pgsql/bin/psql.exe`
- `pgsql/bin/createdb.exe`

The intended managed installation directory is an application-controlled managed PostgreSQL runtime
directory, not the source repository and not a system PostgreSQL installation. The intended data
directory policy is to use an installer-owned managed data directory, preserve business data during
ordinary update/repair, and never initialize over existing business data. The expected local port
policy is loopback-only, dynamically selected where required, with no machine-wide PATH mutation.
The expected runtime identity is Enterprise POS managed PostgreSQL, not an unrelated PostgreSQL
service.

## 3. Source and Provenance Evidence

The Windows binary archive was obtained as an external release input from the EDB/PostgreSQL Windows
binary archive distribution path documented in `resources/postgres/redistribution-manifest.json`.
The official source reference recorded by the repository is
`https://www.enterprisedb.com/download-postgresql-binaries`.

The payload identity is independently verified by:

- the pinned archive filename in `resources/postgres/manifest.json`;
- the pinned archive SHA-256 in `resources/postgres/manifest.json`;
- payload verifier tests in `tests/installer-postgres-archive-stager.test.js`;
- packaging tests in `tests/installer-offline-packaging.test.js`;
- release authorization tests in `tests/installer-postgres-deployment.test.js`;
- canonical manifest binding in `src/main/installer/postgres-release-authorization.js`.

Payload substitution is prevented by exact filename, safe path, archive hash, canonical manifest
hash, required license/notice checks, and release authorization record matching. Public download
metadata does not itself constitute owner or legal approval.

Individual PostgreSQL executable code-signing status is not accepted as complete production evidence
in this packet. The manifest records `signatureStatus` as `required-before-production`, so
executable or archive provenance limitations remain a release-review item.

## 4. Licensing and Redistribution Review

### PostgreSQL

Available technical evidence:

- PostgreSQL license text is included at `resources/postgres/POSTGRESQL-LICENSE.txt`.
- Copyright and attribution notice is preserved in that file.
- Third-party notice tracking is included at `resources/postgres/THIRD-PARTY-NOTICES.md`.
- Archive-required notice entries are tracked in the payload manifest: `pgsql/server_license.txt`
  and `pgsql/commandlinetools_3rd_party_licenses.txt`.
- Installer documentation identifies the bundled version and update policy.
- No PostgreSQL trademark ownership claim is made.
- Payload updates remain pinned and require a new review.

Classification: technical evidence complete for review; owner review pending; legal review pending;
redistribution acceptance pending.

### Microsoft Visual C++ Redistributable

- Packaged filename: `vc_redist.x64.exe`.
- Version: `14.51.36247.0`.
- SHA-256: `843068991DAAA1F73AD9F6239BCE4D0F6A07A51F18C37EA2A867E9BECA71295C`.
- Source reference: `https://aka.ms/vc14/vc_redist.x64.exe`.
- Documentation reference:
  `https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist`.
- Expected signer: `Microsoft Corporation`.
- Signature verification result from certification evidence: valid.

Classification: technical evidence complete for review; owner review pending; legal review pending;
redistribution acceptance pending.

## 5. Security Review

Implemented controls:

- Exact PostgreSQL archive and manifest hash pinning.
- Manifest validation before extraction or execution.
- Release activation record binding.
- Installer version range binding.
- Approved provisioning strategy binding.
- Electron `safeStorage` credential encryption for managed database credentials.
- Password and connection-string redaction.
- Loopback-only PostgreSQL exposure policy.
- SCRAM-SHA-256 PostgreSQL host authentication policy.
- Unsafe database identity rejection.
- Existing installation detection and ambiguous-state blocking.
- Provisioning resume, idempotency, failure, and rollback controls.
- No renderer credential access.
- No manual `.env` dependency for installer-managed startup paths.
- No production activation through renderer input or environment-variable-only bypass.
- Fail-closed activation behavior.

Residual assumptions:

- Windows profile encryption availability must be present for `safeStorage`.
- The final signed installer and payload provenance must be reviewed before release.
- Operational backup and update processes must be followed for future PostgreSQL updates.

## 6. Technical Certification Evidence

Completed technical evidence is represented by committed tests, documentation, and sanitized local
evidence:

- Payload verification tests: `tests/installer-postgres-archive-stager.test.js`.
- VC++ prerequisite verification: `tests/installer-vc-runtime-prerequisite.test.js`.
- Disposable cluster initialization and server startup:
  `tests/installer-postgres-provisioning-engine.test.js`.
- Database and role creation: `tests/installer-postgres-provisioning-engine.test.js`.
- Schema initialization: `tests/installer-postgres-provisioning-engine.test.js`.
- Managed configuration persistence and safeStorage tests: `tests/managed-database-config.test.js`.
- Startup-without-env code-level tests: `tests/managed-database-config.test.js`.
- Provisioning failure matrix: `test-artifacts/vc-runtime-prerequisite/`.
- Restore boundary regression: `tests/settings/backup-restore-boundary.test.js` and
  `tests/settings/restore-production-activation.test.js`.
- Full npm test result: recorded in task validation output.
- Type-check result: recorded in task validation output.
- Secret-redaction result: previous managed PostgreSQL evidence scans passed; new generated packet
  evidence must be scanned before final authorization.

Missing lifecycle evidence must not be invented. The production-gated clean packaged lifecycle has
not run because production provisioning is not authorized.

## 7. Activation Gate Assessment

Current overall assessment: NOT AUTHORIZED.

| Gate condition                            | Current result                                            |
| ----------------------------------------- | --------------------------------------------------------- |
| Packaged production build                 | Code-supported, not sufficient alone                      |
| Production provisioning feature enabled   | Blocked / not enabled                                     |
| Authorizing activation status             | Fails: pending                                            |
| Non-expired approval                      | Fails: pending template expires at placeholder/past value |
| Non-revoked approval                      | Present as `revoked=false`, not sufficient                |
| Exact PostgreSQL version                  | Matches manifest: `17.10`                                 |
| Exact architecture                        | Matches manifest: `win32-x64`                             |
| Exact archive hash                        | Matches pinned manifest when external payload is supplied |
| Exact manifest hash                       | Required by gate; pending record has no approval hash     |
| Redistribution approval status            | Fails: `not-certified` / pending                          |
| Technical evidence hash                   | Fails: unresolved                                         |
| Approved provisioning strategy            | Fails: unresolved in pending record                       |
| Installer version scope                   | Fails: unresolved in pending record                       |
| Legal/security/release approval fields    | Fail: pending                                             |
| Supported installation state              | Must be rechecked during final lifecycle certification    |
| No unresolved provisioning recovery state | Must be rechecked during final lifecycle certification    |

## 8. Installer Scope

Future authorization would cover only:

- Enterprise POS offline installer.
- Exact installer version or explicit permitted version range recorded in the authorization.
- Windows x86-64.
- PostgreSQL 17.10.
- Archive `postgresql-17.10-2-windows-x64-binaries.zip`.
- SHA-256 `EF9B1E5E23D2E8A83914BA13D9DC536A72210FBA53FD1808FF1F7E06BB22B106`.
- Provisioning strategy `extract-and-provision-dedicated-cluster`.
- Local managed PostgreSQL only.
- Supported Windows versions validated by final certification.
- Fresh install, repair/same-version reinstall, and supported reinstall only as explicitly approved.
- Upgrade only after a valid prior managed installer is available and certified.

Not covered:

- Cloud/server deployment.
- Web/mobile deployment.
- Production Restore.
- Future PostgreSQL versions.
- Materially changed payloads or packaging models.

## 9. Residual Risks and Limitations

| Risk                                                                               | Classification               | Approver   |
| ---------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| No independent legal opinion supplied                                              | blocking                     | unresolved |
| No completed clean production-gated lifecycle run                                  | blocking                     | unresolved |
| Unsigned installer for certification artifacts                                     | blocking for release         | unresolved |
| Upgrade path not certified against a prior managed installer                       | blocking for upgrade scope   | unresolved |
| Persistent VM reboot test not completed for production-gated installer             | deferred until authorization | unresolved |
| Uninstall/data-retention user experience still requires final lifecycle validation | blocking                     | unresolved |
| Future PostgreSQL security updates require new review                              | ongoing release requirement  | unresolved |
| safeStorage depends on Windows user/profile encryption context                     | security assumption          | unresolved |
| Installer repair edge cases require final package lifecycle validation             | blocking                     | unresolved |
| Individual executable provenance/signature limitations                             | blocking for release         | unresolved |

## 10. Required Approval Roles

### Product Owner Approval

Status: pending.

Confirms the exact release scope, business decision to bundle PostgreSQL, acceptance of documented
residual risks, approval to proceed to production-gated Sandbox/VM certification, and confirmation
that this packet is not independent legal advice.

### Legal / Redistribution Review

Status: pending.

Confirms or rejects PostgreSQL redistribution, Microsoft VC++ Redistributable distribution, notice
and documentation sufficiency, branding/trademark wording, and any additional obligations.

Allowed values: pending, approved, approved with conditions, rejected, not independently reviewed;
owner accepted.

### Security Approval

Status: pending.

Confirms credential storage, local network exposure, payload verification, authentication
configuration, update strategy, secret-redaction controls, and activation-gate design.

### Release Approval

Status: pending.

Confirms exact installer scope, installer version range, approved payload hashes, permission to
enable production provisioning for certification, and permission to proceed with clean packaged
lifecycle certification.

## 11. Approval Evidence Schema

Non-authorizing template:

`resources/postgres/release-authorization.template.json`

The template contains placeholders for schema version, authorization identity, status, product,
installer version range, PostgreSQL version, platform, architecture, archive filename, archive
SHA-256, payload manifest SHA-256, technical evidence SHA-256, provisioning strategy, redistribution
status, legal review, security approval, release approval, product-owner approval, approval
timestamps, expiry, revocation, conditions, residual risks, approver identities, and evidence
references.

The template is separate from `resources/postgres/release-authorization.pending.json` and remains
non-authorizing.

## 12. Decision Options

### Option A - Remain Blocked

Use when legal/security/release approval is not available.

Result:

- production provisioning stays disabled;
- no production-gated packaged lifecycle is run;
- installer remains certification-only.

### Option B - Authorization for Controlled Certification Only

Allows:

- production activation gate to authorize only the exact test installer;
- execution only in a clean Sandbox/VM certification environment;
- no customer/shop deployment;
- automatic expiration after certification;
- no Production Restore activation.

This option must use an explicit certification-only scope and must not be accepted as customer
production release authorization.

### Option C - Production Release Authorization

Allows:

- exact approved installer/version range;
- exact pinned PostgreSQL payload;
- approved shop deployment;
- clean lifecycle certification must still pass before release.

Do not choose Option C unless required approvals and lifecycle evidence are complete.

## 13. Exact Next Actions After Approval

For controlled certification approval:

1. Validate the signed/completed authorization evidence.
2. Calculate and bind all evidence hashes.
3. Update the authorizing activation record.
4. Enable the production provisioning feature through the guarded policy.
5. Build from a clean committed export.
6. Run the clean packaged Sandbox/VM lifecycle.
7. Verify fresh install without `.env`.
8. Verify restart.
9. Verify repair/same-version reinstall.
10. Verify data and user preservation.
11. Verify uninstall/data-retention behavior.
12. Run a secret-redaction scan.
13. Revoke or expire certification-only authorization after the run.
14. Report the deployment decision.

For production release approval, require all certification results before distribution.

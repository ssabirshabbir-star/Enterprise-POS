# Restore Production Activation Readiness

Document: Restore Production Activation Readiness Version: 1.0 Status: Production Activation Pending
Scope: Enterprise POS Restore release-governance and activation record

## Decision

Production Restore remains disabled.

This document records the current release-governance state for Restore. It does not authorize
production execution, expose a Restore IPC route, or change the Restore button from its guarded
state.

## Current Architecture

The current Restore architecture contains:

- Native backup package selection for inspection, verification, eligibility, dry-run reporting,
  safety-backup preparation, and final-confirmation recording.
- Read-only Restore readiness, governance, execution-policy, startup-recovery, and retention
  assessments.
- A persisted restore operation journal and final-confirmation table.
- A central mutation guard that blocks write-capable IPC routes while dangerous Restore recovery
  states are active.
- A disposable restore execution adapter for certification databases whose names begin with
  `enterprise_pos_restore_cert_`.
- A repository-internal transactional Restore implementation that is not exported to service,
  controller, preload, API, or renderer production paths.

Production Restore execution is not currently exposed.

## Selected Strategy

The only strategy currently represented as approvable is:

`transactional_in_place_with_verified_safety_backup`

This is suitable only after production certification proves that:

- Package verification and compatibility pass before mutation.
- A verified pre-Restore safety backup is mandatory.
- Application writes are blocked during unsafe states.
- Table restoration is dependency-safe.
- Sequence and identity values are repaired.
- Post-Restore validation passes before completion.
- Rollback and startup recovery are certified.

Shadow-database restore and swap remains a future strategy and is not activated by this phase.

## Activation Record

The non-authorizing template is:

`resources/restore/production-activation.pending.json`

The activation record must include:

- Schema version.
- Product and component.
- Release scope.
- Application version.
- Database schema version.
- Backup format version.
- Approved Restore strategy.
- Safety-backup policy.
- Required technical certification evidence and SHA-256 evidence hashes.
- Governance, security, and release approval states.
- Approver identity and approval authority.
- Approval timestamp and expiry.
- Revocation and test-only flags.

The pending record deliberately contains unresolved and pending fields. It cannot authorize
production Restore.

## Production Gate

Production Restore activation must fail closed unless all are true:

- The activation record schema version is known.
- Product, component, release scope, application version, database schema version, and backup format
  match the running release.
- Activation status is approved.
- Restore strategy is approved.
- Safety-backup policy is mandatory verified pre-Restore backup.
- Every required technical certification evidence item has status `passed` and a valid SHA-256
  evidence hash.
- Governance review, security review, and release approval are approved.
- Approver identity and approval authority are resolved.
- Approval is timestamped, unexpired, not revoked, and not test-only.
- Production feature flag is explicitly enabled.
- A production execution route is explicitly present and approved.
- No unresolved Restore recovery state exists.
- No active Restore operation lock exists.
- Database identity is not ambiguous or disposable.

An approved manifest or technical evidence alone is insufficient.

## Required Technical Evidence

The activation gate requires evidence for:

- Backup format compatibility.
- Package verification.
- Authorization and final confirmation.
- Safety backup.
- Maintenance and mutation lock.
- Disposable database success.
- Failure matrix.
- Rollback.
- Startup recovery.
- Post-Restore validation.
- Sequence and identity recovery.
- Restart and reconnect.
- Native file-dialog workflow.
- Restore history and audit.
- Secret redaction.

## Package Verification

Restore package verification must reject malformed or unsafe packages before mutation. Required
checks include manifest presence, metadata presence, supported manifest and backup format versions,
backup class, identity, table inventory, duplicate table detection, integrity declaration, payload
shape, and the invariant that package metadata does not mark Restore production-eligible by itself.

## Compatibility and Eligibility

Current eligibility assessment is governance-only. Production activation still requires an approved
compatibility decision for product identity, application version, schema version, backup format,
workflow version, and table coverage.

Unsupported newer backups and unknown schema compatibility must fail closed.

## Safety Backup

Production Restore must require a newly created and verified safety backup before destructive
mutation. Disposable certification bypasses or test fixtures must never apply to the primary
database.

## Maintenance Lock

The mutation guard must remain active for dangerous Restore recovery states and must reject backend
write IPC routes, not just renderer buttons.

## Rollback and Recovery

Restore must not report success until post-Restore validation passes. Failures after destructive
mutation must transition to rollback or manual recovery states according to the persisted operation
journal. Startup must inspect unresolved operations before normal writes are allowed.

## UI

The Settings Restore UI remains read-only for production execution. It may inspect packages, verify
packages, assess eligibility, assess authorization, generate dry-run reports, prepare safety backup
evidence, record final-confirmation evidence, and display recovery/policy state. It must not expose
production Restore execution until an authentic activation record and approved route exist.

## Data Retention

Safety backups, recovery evidence, and failed Restore artifacts must be retained unless a bounded,
operation-owned cleanup policy proves deletion is safe. Business data and primary backups must not
be silently deleted by Restore cleanup.

## Remaining Blockers

- No authentic production activation record exists.
- Production execution route remains intentionally absent.
- Production feature flag remains disabled.
- Full installed-application Restore UI execution certification has not been authorized.
- Shadow-database swap is not implemented or selected.
- Formal release/security approval is unresolved.

## Next Action

Review the technical Restore evidence and replace the pending activation record only after an
authorized release owner approves the exact application version, schema version, backup format,
Restore strategy, certification evidence hashes, safety-backup policy, security review, and release
scope.

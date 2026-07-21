# Production Restore Authorization Packet

## Decision State

Technical certification status: complete for repository-controlled DB-backed production-route
certification.

Production activation status: pending. This packet does not authorize production Restore.

## Scope

- Product: Enterprise POS desktop application
- Target: installer-managed local PostgreSQL database only
- Restore strategy: transactional in-place Restore with verified pre-Restore safety backup
- Backup format: 1.0
- Unsupported targets: arbitrary PostgreSQL instances, remote/cloud databases, copied configuration
  identities, and databases without a matching managed identity marker

## Certification Evidence

- Source commit: c0e8586dce13b74035d7e16b253011bd3ee075b3
- Certification run: run-20260721092904
- Evidence manifest SHA-256: ca39eed60f1971f2105bc0f509e09f1aa05f91741b0a9fb9c54e5eea790d5716
- Evidence directory:
  test-artifacts/production-restore-certification/run-20260721-db-backed-pg17-rerun22-final-active17

## Controls Preserved

- Administrator authorization and final typed confirmation
- Manifest and SHA-256 package verification
- Durable managed installation/database identity validation
- Safety-backup creation and verification before destructive mutation
- Confirmation binding to operation, backup, target, user and expiry
- Confirmation consumption and replay rejection
- Restore operation mutation lock
- Destination managed identity preservation
- Post-restore schema, critical-table and user validation
- Rollback/manual-recovery state transitions
- Secret redaction in evidence

## Residual Risks

- Human owner/release approval is not recorded.
- Human security/governance approval is not recorded.
- The committed activation record remains pending and non-authorizing.
- Production Restore feature flag remains disabled.

## Required Human Approval

Owner/release approver must review this packet, the evidence manifest, and generated evidence, then
complete an authorizing activation record only if the scope and residual risks are accepted.

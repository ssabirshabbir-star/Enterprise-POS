# Table Coverage Policy

Document: Table Coverage Policy  
Version: 1.0  
Status: Governance Reference  
Scope: Backup and Restore Table Coverage Governance  
Applies To: Desktop POS, Future Web Edition, Future Cloud Edition, Future ERP Editions  
Depends On: Documents 00-44, Backup & Restore Workflow Reference

## 1. Purpose

Table coverage governance is required before Backup or Restore can be certified.

Backup and Restore workflows cannot be considered safe until every database object has an approved
coverage classification. Without table coverage governance, a backup may appear complete while
silently excluding data required for recovery, audit integrity, financial continuity, security,
sync, or future module behavior.

This document defines the governance policy that future table inventories must follow. It does not
classify actual implementation tables.

## 2. Scope

This policy governs future classification of database objects used by the Enterprise POS system.

Future table inventories must evaluate:

- Business tables.
- Configuration tables.
- Security tables.
- Audit tables.
- Integration tables.
- Backup and restore history tables.
- Sync and queue tables.
- Installer and deployment tables.
- Future module tables.
- Future edition-specific tables.

This document applies to current and future modules, but it does not name, classify, or approve
specific implementation tables.

## 3. Coverage Classification Model

Every database object must eventually receive one official coverage classification.

### Mandatory

Mandatory objects are required for the declared backup class to be truthful and restorable.

Omitting a Mandatory object would make the backup incomplete for its declared purpose.

### Optional

Optional objects may be included when useful but are not required for the declared backup class.

Optional omission must not break the declared recovery promise.

### Excluded

Excluded objects are intentionally omitted from the backup class.

An Excluded classification must include a governance reason, dependency review, and recovery impact
statement.

### Temporary

Temporary objects contain short-lived data that does not need to survive recovery.

Temporary classification must not be used for data that affects audit history, financial state,
security, inventory state, or user obligations.

### Generated

Generated objects can be rebuilt from other certified data.

Generated classification requires confidence that rebuild behavior is deterministic, safe, and
approved.

### Runtime Cache

Runtime Cache objects support active application execution and should normally be excluded from
backup.

Cache rebuild expectations must be documented before restore certification.

### Future Reserved

Future Reserved objects belong to modules, editions, or workflows that are not yet certified for
Backup or Restore.

Reserved objects must be revisited before the related feature or edition is activated.

## 4. Recovery Criticality

Every database object must eventually receive a recovery criticality level.

### Critical

Critical data is required to restore core business, security, financial, or operational integrity.

Loss or corruption of Critical data may make the system unsafe or unusable.

### High

High criticality data materially affects operations, reporting, auditability, or recovery quality.

Loss of High criticality data may not fully stop the system, but it can create serious operational
or governance gaps.

### Medium

Medium criticality data supports normal workflows but may be recoverable through manual process,
re-entry, or controlled reconstruction.

### Low

Low criticality data improves convenience, display, or secondary behavior but does not materially
affect core recovery.

### Rebuildable

Rebuildable data can be reconstructed from certified source data without violating governance,
audit, or operational expectations.

No actual table criticality is assigned by this document.

## 5. Dependency Classification

Every database object must eventually receive a dependency classification.

### Parent

Parent objects own records that other objects depend on.

### Child

Child objects depend on parent records and may be unsafe to restore without them.

### Independent

Independent objects can be evaluated without direct dependency on another object for the declared
backup class.

### Shared

Shared objects are used by multiple modules or workflows and require cross-module coverage review.

### External

External objects represent data tied to external systems, providers, devices, files, or future cloud
services.

### Reserved

Reserved dependency classification applies where the dependency behavior is not yet approved.

This document defines dependency governance only. It does not define implementation ordering.

## 6. Restore Ordering Principles

Restore sequencing must be governed by data safety, dependency integrity, and auditability.

Restore ordering principles are:

- Parent data must be considered before dependent child data.
- Shared data must be reviewed for cross-module effects.
- Security and identity data must not be restored casually.
- Audit and activity data must preserve reviewability.
- Financial and inventory dependencies must remain consistent.
- Generated and cache data must not be restored as authoritative unless certified.
- Reserved dependencies must block certification until reviewed.

This document does not define algorithms, SQL, implementation ordering, or restore procedures.

## 7. Certification Rules

No database object may be declared Backup Certified or Restore Certified without governance review.

### Backup Certified

An object may be declared Backup Certified only when:

- Coverage classification is approved.
- Recovery criticality is approved.
- Dependency classification is approved.
- Inclusion or exclusion decision is documented.
- Backup class compatibility is reviewed.
- Manifest expectations are defined.
- Verification expectations are defined.

### Restore Certified

An object may be declared Restore Certified only when:

- Backup Certified status exists.
- Restore dependency impact is reviewed.
- Restore ordering expectations are approved.
- Rollback expectations are approved.
- Compatibility expectations are approved.
- Audit and activity expectations are approved.
- Restart or reconnect impact is reviewed.

Certification failure blocks activation.

## 8. Exclusion Policy

Exclusion is permitted only when omission is safe for the declared backup class.

Exclusion may be permitted for:

- Temporary data.
- Runtime cache.
- Generated data with approved rebuild expectations.
- Future reserved data not included in the declared backup class.
- Data outside the declared scope.

Exclusion is prohibited when omission would:

- Break recovery integrity.
- Break financial continuity.
- Break inventory continuity.
- Break identity, role, or permission integrity.
- Break auditability.
- Break sync or integration consistency.
- Delete or desynchronize dependent data.
- Misrepresent the backup class.

Every exclusion must document:

- Reason for exclusion.
- Dependency impact.
- Recovery impact.
- Audit impact.
- Future review condition.

## 9. Future Expansion

Future coverage governance must support:

- Multi-store deployments.
- ERP expansion.
- Cloud editions.
- Tenant isolation.
- Future modules.
- Future integration providers.
- Future installer and migration workflows.

Future expansion must not reuse table classifications casually. Each new module, edition, tenant,
store, or integration must receive explicit coverage review before certification.

## 10. Implementation Constraints

This document authorizes no implementation.

This document does not authorize:

- Backup activation.
- Restore activation.
- Schema changes.
- Database modifications.
- Source-code modifications.
- Renderer changes.
- API wrapper changes.
- Preload changes.
- IPC changes.
- Controller changes.
- Service changes.
- Repository changes.
- SQL changes.
- Installer changes.
- Licensing changes.

Future implementation may begin only after governance approval, workflow approval, architecture
review, and Product Owner approval.

The frozen architecture remains authoritative:

Renderer -> API Wrapper -> Preload -> Controller -> Service -> Repository -> Database

Renderer remains UI-only.

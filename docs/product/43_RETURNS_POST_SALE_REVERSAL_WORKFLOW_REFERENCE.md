# Returns / Post-Sale Reversal Workflow Reference

Document: Returns / Post-Sale Reversal Workflow Reference  
Version: 1.0  
Status: Active Governance Reference  
Scope: Returns, Refunds, Exchanges, and Sale-Linked Reversal Workflows  
Applies To: Desktop POS, Future Web Edition, Future Cloud Edition, Future ERP Editions  
Depends On: Project Constitution, Architecture Rules, Product Experience Blueprint, Reference
Architecture Compliance Standard

## 1. Purpose

Returns are not ordinary CRUD.

Returns are post-sale reversal workflows that may affect sale records, refund payments, product
stock, inventory records, customer ledger, sync queue, audit/activity history, and Lucky Draw or
coupon state.

This document defines the narrow governance and reference rules required before Returns can be
considered installer-ready or further activated.

## 2. Applies To

This reference applies to:

- Returns.
- Refunds.
- Exchanges.
- Credit notes if added later.
- Stock restoration from returns.
- Customer credit refunds.
- Sale-linked reversal workflows.

## 3. Required Workflow Boundary

Returns must preserve the approved architecture boundary:

Renderer -> ReturnsApi -> Preload -> Controller -> Service -> Repository -> Database

Renderer code may request return actions only through the approved Returns API wrapper. Backend
service and repository layers remain authoritative for validation, financial rules, stock changes,
ledger changes, sync writes, and persistence.

## 4. Renderer Rules

The Returns renderer must remain UI-only.

Renderer code must:

- Avoid direct database access.
- Avoid direct IPC access.
- Avoid direct stock authority.
- Avoid direct financial authority.
- Display clear warnings for destructive or financial actions.
- Prevent duplicate user submission where practical.
- Show only real, disabled, gated, or clearly unavailable actions.
- Use official terminology from the Product Language Standard.

Renderer code must not:

- Decide returnable quantity.
- Decide refund limits.
- Restore stock directly.
- Update customer ledger directly.
- Write audit or sync records directly.
- Expose fake active Exchange workflows.
- Expose fake active Refund workflows.

## 5. Backend Authority Rules

Service and repository layers must be authoritative for:

- Invoice lookup.
- Returnable quantity.
- Refund limits.
- Refund method restrictions.
- Duplicate prevention.
- Stock restoration.
- Customer ledger updates.
- Sync queue writes.
- Audit/activity logging.
- Lucky Draw or coupon reversal blocking.

Renderer validation may improve user feedback, but backend validation must remain the final
authority.

## 6. Transaction / Rollback Rules

Return creation must be atomic or safely rollbackable across all affected records.

The following writes must not leave partial state:

- Return record creation.
- Return item creation.
- Refund payment creation.
- Product stock restoration.
- Inventory stock restoration.
- Stock movement recording.
- Customer ledger update.
- Sync queue write.
- Audit-sensitive records.

If any required write fails, the return must not be partially completed. The system must either roll
back the full operation or provide a verified recovery path before installer readiness.

## 7. Visible Feature Parity Rules

Before the first installer:

- Process Return must be certified or disabled/gated.
- Exchange must be disabled or clearly unavailable unless implemented.
- Print, export, and WhatsApp return actions must not appear active unless implemented.
- Recent Returns must reflect real records only.
- Any visible button, tab, menu item, shortcut, or panel must be working, disabled,
  FeatureGate-protected, or clearly unavailable.

No fake active return, refund, exchange, print, export, or external communication action may be
exposed.

## 8. Permission / RBAC Rules

Returns permission handling must be reviewed before installer readiness.

Governance requirements:

- Returns view permission must be distinct from refund/create permission.
- Refund/create actions must require stricter permission than read-only Returns.
- Local role-set helpers are acceptable as legacy implementation only.
- Local role-set helpers are not sufficient for final certification.
- Any future Exchange or Credit Note workflow must define its own permission boundary before
  activation.

## 9. Certification Checklist

Returns certification must verify:

- The same sale item cannot be over-returned.
- Refund amount cannot exceed original paid amount or allowed customer credit amount.
- Stock restoration is correct.
- Inventory records are updated consistently with product stock.
- Stock movements are recorded correctly.
- Customer ledger is correct for Customer Credit refunds.
- Cash, card, bank, and customer-credit refund rules are correct.
- Lucky Draw or coupon blocking works.
- Duplicate submit is prevented.
- Failed return rolls back or is safely recoverable.
- Audit/activity records are correct.
- Sync queue records are correct.
- UI confirmation is clear before financial or stock reversal.
- Exchange remains unavailable unless fully implemented.
- Print, export, and WhatsApp actions remain unavailable unless fully implemented.

## 10. Installer Readiness Rule

Returns cannot be considered installer-ready until certified against this document.

A module may be architecturally aligned without being functionally certified, installer-ready, or
production mature. Returns must be reported separately under:

- Architecture Readiness.
- Workflow Readiness.
- Feature Completeness.
- Installer Readiness.
- Production Maturity.

## 11. Non-Goals

This document does not authorize implementation.

Non-goals:

- Do not implement Exchange now.
- Do not redesign the Returns UI now.
- Do not add schema unless separately approved.
- Do not add cloud sync behavior now.
- Do not activate unimplemented print, export, WhatsApp, or credit-note workflows.

## 12. Known Current Limitations

Known current limitations include:

- Process Return is currently active and high-risk.
- Exchange is visible but placeholder-only.
- Renderer lifecycle is missing.
- Permission helpers use local role sets.
- Full certification is pending.
- Installer readiness is not yet approved.

## 13. Governance Rule

Any future Returns, Refund, Exchange, Credit Note, or sale-linked reversal implementation must
remain consistent with this document unless this document is formally amended through the approved
governance process.

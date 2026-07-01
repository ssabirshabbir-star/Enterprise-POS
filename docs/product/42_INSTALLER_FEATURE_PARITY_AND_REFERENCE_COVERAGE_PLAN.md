# Installer Feature Parity and Reference Coverage Plan

Document: Installer Feature Parity and Reference Coverage Plan  
Version: 1.0  
Status: Draft  
Scope: Installer Readiness, Feature Parity, Reference Coverage  
Applies To: Enterprise POS first installer preparation  
Depends On: Documents 00-41

## 1. Goal

The first installer must not ship with confusing, fake, or accidentally active UI.

Every currently visible UI feature must be one of:

- Fully functional.
- Safely disabled.
- FeatureGate-protected.
- Explicitly marked unavailable with a clear message.

The installer baseline must protect cashier workflows, data safety, stock safety, financial
accuracy, and user trust before commercial polish begins.

## 2. Reference Coverage Requirement

Before replaceable UI work begins, every major module type must have a reference implementation
pattern.

Required reference coverage:

- Transaction module.
- Master data module.
- Renderer-owned dashboard/analytics module.
- Inventory/stock module.
- Procurement module.
- Returns/post-sale module.
- Reports/read-only aggregation module.
- Settings/configuration module.
- User/RBAC module.
- Backup/Restore utility module.

Reference coverage means architecture readiness and implementation pattern clarity. It does not
automatically mean feature completeness, installer readiness, or production maturity.

## 3. Current Completed References

Current Architecture Reference modules:

- Billing.
- Products.
- Customers.
- Dashboard.
- Suppliers.
- Inventory.

These modules establish current patterns for renderer ownership, API-wrapper boundaries, lifecycle
cleanup, FeatureGate safety, placeholder handling, and data-only wrapper behavior.

## 4. Remaining Reference Coverage

Likely remaining module coverage before replaceable UI:

- Purchases.
- Purchase Orders.
- Returns.
- Sales History / Completed Invoices.
- Expenses.
- Reports.
- Settings.
- User Management / Access Control.
- Backup / Restore.
- Installer / First Run.

Each remaining module must be reviewed against Document 41 before being treated as an Architecture
Reference.

## 5. Visible Feature Parity Rule

Any visible button, tab, menu item, shortcut, panel, modal, toolbar action, or navigation entry must
not be fake.

Every visible feature must be:

- Working.
- Disabled.
- Gated.
- Unavailable with a clear message.

Unfinished features must not appear as equal-primary actions beside fully working installer
features.

Placeholder features must not trigger partial workflows, financial changes, destructive operations,
background sync, import/export, stock mutation, or external communication unless explicitly approved
and protected.

## 6. Backup / Restore Requirement

Backup / Restore is mandatory before the first installer.

Minimum first-installer scope:

- Manual backup.
- Manual restore.
- Backup location selection.
- Database dump/restore or safe equivalent.
- Validation before restore.
- Warning before destructive restore.
- App restart requirement if needed.
- Clear restore failure handling.
- No cloud backup in the first installer unless separately approved.

Backup / Restore must be treated as a utility reference module because it protects customer data and
supports installer confidence.

## 7. Replaceable UI Readiness

Replaceable UI work can start only after:

- Visible feature parity is complete.
- Reference coverage is sufficient across major module types.
- Module APIs are stable enough for UI replacement.
- Placeholder behavior is governed.
- Installer baseline is working.
- Backup / Restore minimum scope is validated.

Replaceable UI must not begin while visible installer features are fake, partially active, or
confusing.

## 8. Commercial Readiness Deferred

Commercial polish comes after replaceable UI baseline.

Deferred commercial work includes:

- Premium visual polish beyond reference alignment.
- Website.
- Marketing content.
- Sales kit.
- Platform selling.
- Commercial packaging beyond installer safety.

Commercial readiness must build on a stable installer baseline, not compensate for feature gaps.

## 9. Implementation Order Recommendation

Recommended order from the current point:

1. Purchases.
2. Purchase Orders.
3. Returns.
4. Sales History / Completed Invoices.
5. Expenses.
6. Reports.
7. Settings.
8. User Management / Access Control.
9. Backup / Restore.
10. Installer / First Run.
11. Replaceable UI.
12. Commercial readiness.

This order prioritizes operational workflow coverage first, read-only aggregation second,
administrative safety third, data protection fourth, installer baseline fifth, and commercial polish
last.

## 10. Review Checklist

Before approving a module for installer parity:

- All visible controls are mapped.
- Working controls are validated.
- Incomplete controls are disabled, gated, or clearly unavailable.
- Placeholder actions do not mutate data.
- Destructive actions have protection.
- Financial actions have validation.
- External actions are gated where required.
- Renderer/API boundaries match Document 41.
- Module APIs are stable enough for future UI replacement.
- Any remaining limitations are documented.

## 11. Commit Safety Checklist

Before staging installer-parity or reference-coverage work:

- Stage only files in the approved scope.
- Exclude HOLD files.
- Exclude unrelated module changes.
- Verify no accidental schema/preload/main/IPC changes.
- Verify no hidden FeatureGate activation.
- Review visible feature behavior.
- Run required validation.
- Report known limitations separately from completed work.

## 12. Known Holds

Lucky Draw V2 remains on HOLD.

Do not touch:

- `src/main/features/luckydraw_v2/ipc/luckydraw.api.js`
- `src/main/features/luckydraw_v2/ui/luckydraw.renderer.js`

Existing Lucky Draw V2 modifications must not be staged or committed as part of installer feature
parity, reference coverage, or replaceable UI preparation unless the HOLD is explicitly lifted.

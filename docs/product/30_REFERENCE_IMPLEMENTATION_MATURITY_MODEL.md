# Reference Implementation Maturity Model

Status: Governance Draft

Document: Reference Implementation Maturity Model

Version: 1.0

Scope: Product Governance, Architecture Governance, Installer Readiness

Applies To:

- Desktop POS
- Future Web Edition
- Future Cloud Edition
- Future ERP Editions
- Installer/Core Release planning

Depends On:

- Project Constitution
- Architecture Rules
- Commercial Product Philosophy
- 20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md
- 21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md
- 28_IMPLEMENTATION_STANDARDS_AND_REFERENCE_STRATEGY.md
- 29_INSTALLER_FEATURE_ENABLEMENT_PLAN.md

Next Document: To be defined

## 1. Purpose

This document defines module maturity levels for Enterprise POS so future audits, implementation
reports, milestone reports, and governance documents do not confuse architecture readiness with full
functional completeness.

A module can be a reference for architecture, boundary separation, or safety patterns without being
functionally complete or installer ready.

This model exists to prevent silent scope inflation. It requires every module assessment to
distinguish between:

- Architecture Readiness
- Feature Completeness
- Installer Readiness
- Functional Maturity

## 2. Maturity Levels Table

| Level   | Name                   | Meaning                                                                                                                                                                                                               | Required Evidence                                                                                                              | What It Does Not Mean                                                                                                     |
| ------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Level 1 | Architecture Reference | The module follows approved architecture boundaries. Renderer owns UI, API returns structured data only, FeatureGate blocks guarded/locked actions, and no architecture violations are present.                       | Static architecture review, API/renderer boundary scan, FeatureGate coverage scan, no direct renderer database/IPC violations. | It does not mean the module is functionally complete, installer ready, or production mature.                              |
| Level 2 | Workflow Reference     | The core workflow works end-to-end and the main user path is stable. Some secondary features may remain disabled, hidden, or deferred.                                                                                | Manual workflow validation, core path smoke test, no blocker in the main user journey.                                         | It does not mean every feature is complete or every edge case is validated.                                               |
| Level 3 | Functional Reference   | Most module features are complete and tested. Placeholders are removed or fully hidden. Error handling and edge cases are validated.                                                                                  | Feature inventory, automated validation, manual regression, placeholder audit, error-state review.                             | It does not automatically mean the module is safe for installer default enablement.                                       |
| Level 4 | Installer Ready        | The module is safe for default installer/core release enablement. No risky placeholder exposure remains. The module is smoke-tested in installer/core mode, and destructive or financial-risk features are protected. | Installer-mode smoke test, FeatureGate default review, placeholder hiding audit, destructive action protection review.         | It does not mean the module has enterprise-grade production maturity, support readiness, or complete regression coverage. |
| Level 5 | Production Mature      | The module is commercially mature for long-term production use. Performance, recovery, audit, permissions, regression tests, and support readiness are complete.                                                      | Performance validation, recovery testing, audit trail review, permission review, regression suite, support diagnostics.        | It does not mean future ERP expansion is finished.                                                                        |

## 3. Official Progress Matrix

| Level   | Maturity Name          | Governance Meaning                        | Release Meaning    |
| ------- | ---------------------- | ----------------------------------------- | ------------------ |
| Level 1 | Architecture Reference | Reusable implementation pattern           | Not releasable     |
| Level 2 | Workflow Reference     | Validated workflow pattern                | Not releasable     |
| Level 3 | Functional Reference   | Feature-complete reference implementation | Internal/Beta only |
| Level 4 | Installer Ready        | Installer validated                       | Release Candidate  |
| Level 5 | Production Mature      | Operationally hardened                    | Production Ready   |

The progress matrix is the official shorthand for milestone reporting. It must not be used to skip
acceptance gates or imply release readiness before validation evidence exists.

## 4. What Reference Module Means

"Reference Module" must be qualified by the kind of reference being claimed.

Allowed examples:

- Architecture Reference
- Renderer/API Boundary Reference
- FeatureGate Safety Reference
- Core Workflow Reference
- Core Cashier Flow Reference
- Installer Readiness Reference

Disallowed unqualified usage:

- Complete Reference Module
- Full Feature Reference
- Production Reference
- Installer-complete Reference

A reference module means one or more approved patterns have been proven and may guide future work.
It does not mean every feature in that module is complete.

## 5. Reference Does Not Mean Complete

Reference status does not imply:

- Feature completeness
- Installer readiness
- Production maturity
- Workflow completeness
- QA completion
- Operational readiness

Reference modules exist to define implementation patterns only. A module may be an excellent
architecture reference while still requiring feature completion, installer validation, QA coverage,
and production hardening.

## 6. Billing Clarification

Billing must currently be described only as:

- Architecture Reference
- Renderer/API Boundary Reference
- FeatureGate Safety Reference
- Core Cashier Flow Reference

Billing must not be described as:

- Full Feature Reference
- Complete Functional Reference
- Installer-complete Billing Module

Billing is a valid reference for the core cashier architecture and boundary model. It is not yet a
claim of full feature completeness, full installer readiness, or production maturity.

## 7. Current Module Maturity Snapshot

| Module        | Current Maturity                                                  | Notes                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Billing       | Level 1 / partial Level 2                                         | Architecture, renderer/API boundary, FeatureGate safety, and core cashier flow reference patterns are established. Some secondary features remain guarded, locked, or deferred. |
| Products      | Level 1                                                           | Architecture boundary is established. Feature completeness and installer readiness still require separate validation.                                                           |
| Customers     | Level 1                                                           | Architecture boundary is established. FeatureGate governance is aligned for placeholders and guarded actions. Installer readiness still requires separate smoke testing.        |
| Dashboard     | Installer-safe analytics subset; renderer ownership refactor HOLD | Analytics widgets are installer-safe where already validated, but the dashboard renderer ownership refactor remains on HOLD and must not be treated as complete.                |
| Suppliers     | Partial / not installer-default ready                             | Supplier workflows require smoke testing and governance review before default installer enablement.                                                                             |
| Lucky Draw V2 | HOLD / not installer ready                                        | Lucky Draw V2 remains held and must not be treated as installer ready.                                                                                                          |

## 8. Approval Gates

### Level 1 Gate: Architecture Reference

A module may move to Level 1 only when:

- Renderer owns UI behavior.
- API wrapper returns structured data only.
- FeatureGate protects guarded and locked actions.
- Renderer does not access database, SQL, `getPool`, or `ipcRenderer`.
- No business logic is moved into renderer.
- No architecture violations are found.

### Level 2 Gate: Workflow Reference

A module may move to Level 2 only when:

- The primary user workflow works end-to-end.
- The main path is manually validated.
- Disabled secondary features do not confuse users.
- The workflow is stable after route navigation and refresh.
- Error, empty, and loading states do not block the main path.

### Level 3 Gate: Functional Reference

A module may move to Level 3 only when:

- Most planned module features are implemented and tested.
- Placeholders are removed or fully hidden.
- Error handling is user-friendly and consistent.
- Edge cases have been validated.
- Feature inventory matches actual runtime behavior.

### Level 4 Gate: Installer Ready

A module may move to Level 4 only when:

- Installer/core mode has been smoke-tested.
- Safe features are enabled by default only when validated.
- Guarded features are optional and blocked unless validated.
- Locked features are hidden or non-executable.
- Destructive and financial-risk actions are protected.
- Placeholder actions are not exposed as active workflows.

### Level 5 Gate: Production Mature

A module may move to Level 5 only when:

- Performance is validated for long working sessions.
- Recovery and rollback behavior is validated.
- Permissions and audit requirements are verified.
- Regression tests cover core flows and major edge cases.
- Support and diagnostic readiness is complete.

## 9. Maturity Promotion Policy

A module may not advance to the next maturity level until the documented acceptance criteria for the
current level have been satisfied and validated.

No level may be skipped. A module must progress through Level 1, Level 2, Level 3, Level 4, and
Level 5 in order.

Promotion requires documented evidence from the appropriate approval gate. If evidence is
incomplete, conflicting, or unavailable, the module remains at its current level.

## 10. Audit Reporting Requirement

Every future audit must report maturity separately under:

- Architecture Readiness
- Workflow Readiness
- Feature Completeness
- Installer Readiness
- Production Maturity

Audits must never merge these categories into one status. A module may be strong in one category and
weak in another, and the report must preserve that distinction.

## 11. Audit Language Rules

Every future report must explicitly separate:

- Architecture Readiness
- Feature Completeness
- Installer Readiness
- Functional Maturity

Reports must not use "reference" as a vague maturity claim. The kind of reference must be named.

Correct examples:

- "Billing is an Architecture Reference and Core Cashier Flow Reference."
- "Products is Level 1 architecture-ready, but not yet installer-ready."
- "Customers has FeatureGate safety alignment, but requires installer-mode smoke testing."

Incorrect examples:

- "Billing is complete."
- "Billing is installer-ready."
- "Products is a full reference module."
- "Customers is production mature."

When there is uncertainty, the report must choose the lower maturity level until validation evidence
proves otherwise.

## 12. Installer Readiness Warning

Installer readiness is a separate maturity claim and must never be inferred from architecture
readiness.

A module is not installer ready merely because:

- Its renderer/API boundary is clean.
- FeatureGate exists.
- Placeholders are hidden.
- Core workflow appears stable.
- A reference implementation pattern exists.

Installer readiness requires installer/core mode validation, safe defaults, no risky placeholder
exposure, protected destructive actions, protected financial-risk actions, and smoke testing across
the enabled runtime paths.

## 13. Governance Rules

- This document governs maturity language for all future repository audits and milestone reports.
- Any module maturity claim must cite the level being claimed.
- If a module advances levels, the approval gate evidence must be recorded.
- If a module regresses, the maturity level must be lowered in the next audit.
- This document does not activate features, change architecture, change UI, or alter installer
  defaults.

# Implementation Standards and Reference Strategy

## Document Metadata

| Field      | Value                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Document   | Implementation Standards and Reference Strategy                                                                                                                                                                                                                                      |
| Version    | Draft v1                                                                                                                                                                                                                                                                             |
| Status     | Draft for Review                                                                                                                                                                                                                                                                     |
| Scope      | Production UI implementation standards and reference implementation strategy                                                                                                                                                                                                         |
| Applies To | Desktop POS; Future Web Edition; Future Cloud Edition; Future ERP Editions                                                                                                                                                                                                           |
| Depends On | 20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md; 21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md; 22_PRODUCT_DESIGN_CONSTITUTION.md; 23_DESIGN_TOKENS.md; 24_COMPONENT_LIBRARY_SPECIFICATION.md; 25_LAYOUT_PATTERNS.md; 26_MODULE_WIREFRAMES.md; 27_PREMIUM_UI_PROTOTYPE.md |

## 1. Purpose

This document defines the implementation standards and reference implementation strategy for
converting the approved Enterprise POS product/design foundation into production UI.

It does not implement anything.

## 2. Scope

This document governs how future UI implementation work should proceed after approval.

It applies to:

- UI implementation planning.
- Visual modernization.
- Module-by-module rollout.
- Reference implementation review.
- Regression protection.
- Commit and validation discipline.

It does not authorize code, backend, preload, database, schema, or architecture changes.

## 3. Implementation Authority

Higher authority:

- Project Constitution.
- Architecture Rules.
- Commercial Product Philosophy.
- 20 Enterprise Product Experience Blueprint.
- 21 Enterprise Product Language & Terminology Standard.
- 22 Product Design Constitution.
- 23 Design Tokens.
- 24 Component Library Specification.
- 25 Layout Patterns.
- 26 Module Wireframes.
- 27 Premium UI Prototype.

This document controls:

- UI implementation workflow.
- Reference implementation sequence.
- File safety rules.
- Validation expectations.
- Escalation rules.
- Commit discipline.

Lower authority:

- Individual implementation tasks.
- Module UI changes.
- Renderer files.
- CSS files.
- HTML fragments.

If an implementation conflicts with this document or a higher authority, implementation must stop
until the conflict is resolved.

## 4. Approved Source-of-Truth Documents

All implementation work must read and follow:

- `20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md`
- `21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md`
- `22_PRODUCT_DESIGN_CONSTITUTION.md`
- `23_DESIGN_TOKENS.md`
- `24_COMPONENT_LIBRARY_SPECIFICATION.md`
- `25_LAYOUT_PATTERNS.md`
- `26_MODULE_WIREFRAMES.md`
- `27_PREMIUM_UI_PROTOTYPE.md`

Implementation must not invent product direction, terminology, visual rules, components, layouts, or
wireframes outside these approved documents.

## 5. Non-Negotiable Architecture Rules

The approved architecture remains:

```text
Renderer -> Preload -> Controller -> Service -> Repository -> Database
```

Rules:

- Renderer must remain UI-only.
- Renderer must use `window.posApi` only.
- Renderer must not access the database directly.
- Renderer must not use direct IPC.
- No backend change is allowed unless separately approved.
- No preload change is allowed unless separately approved.
- No database/schema change is allowed unless separately approved.
- No terminology drift is allowed.
- No silent design system changes are allowed.
- No business logic may be moved into UI implementation work.

## 6. Implementation Philosophy

Implementation must produce a premium commercial desktop UI while protecting productivity.

Implementation must prioritize:

- Premium commercial desktop quality.
- Productivity-first workflows.
- Keyboard-first operation.
- Fast cashier workflow.
- Dense but readable information.
- Stability over decoration.
- Accessibility.
- Long-session comfort.
- Clear information hierarchy.

Visual polish must not reduce operational speed.

## 7. Reference Implementation Strategy

The first reference module is:

**Billing (POS)**

Billing must prove the product/design foundation because it is the most important cashier workflow.

Other modules must follow only after the Billing reference implementation is reviewed and accepted.

The Billing reference implementation establishes:

- Visual quality baseline.
- Component behavior expectations.
- Layout interpretation.
- Keyboard productivity standard.
- State handling standard.
- Review and validation discipline.

## 8. Billing Reference Implementation Scope

Allowed scope by default:

- Renderer UI only.
- Existing backend APIs only.
- Existing preload APIs only.
- Existing business logic only.
- Existing database schema only.

Not allowed by default:

- Schema changes.
- New backend routes.
- Business logic changes.
- Repository changes.
- Service changes.
- Controller changes.
- Preload changes.

If Billing implementation is blocked by backend, preload, or schema limitations, stop and request
separate approval before changing those layers.

## 9. Billing UX Acceptance Criteria

Billing reference implementation must demonstrate:

- Premium desktop visual quality.
- Fast product search/scanning.
- Minimal mouse travel.
- Fast scan-to-pay flow.
- No unnecessary repeated data entry.
- Cashier endurance for long working sessions.
- Cart clarity.
- Payment clarity.
- Visible primary actions.
- Preserved keyboard shortcuts.
- Clear customer area.
- Clear Lucky Draw receipt/message area.
- Clear discount area.
- Clear payment area.
- No ERP complexity in cashier flow.
- No table/footer overlap.
- No hidden critical actions.
- Readability at supported desktop resolutions.
- Stable focus behavior.
- Compact, non-disruptive feedback.
- Accessible status and error communication.

Billing must feel like the Fast Cashier Console.

## 9.1 Billing Reference Acceptance Gate

Rollout to other modules may begin only after the Billing reference implementation is approved by
the Product Owner.

Acceptance must include:

- UX review.
- Visual quality review.
- Workflow review.
- Keyboard flow review.
- Validation review.
- Regression review.

Billing acceptance is the gate that confirms the approved product/design foundation can be applied
successfully in production UI.

## 10. Implementation Workflow

Every implementation task must follow:

1. Read approved product/design documents first.
2. Identify target files.
3. Prepare a focused plan.
4. Make the smallest safe change.
5. Validate.
6. Report.
7. Review before commit.

Implementation must proceed one module at a time.

## 11. File Safety Rules

Rules:

- One module at a time.
- No God Files.
- Preserve split files.
- No unrelated cleanup.
- No backend edits hidden inside UI work.
- No large rewrites unless approved.
- No architecture changes inside visual tasks.
- No terminology changes outside approved documentation.
- No broad formatting churn.
- No touching stabilized modules unless included in the task.

Implementation must protect working business flows.

## 11.1 Rollback and Recovery Safety

Implementation must be organized into safe batches that can be reviewed, validated, and rolled back
without disturbing unrelated modules.

Rules:

- Keep changes isolated to the approved scope.
- Avoid spreading one visual change across unrelated modules before the reference is accepted.
- Preserve a clear rollback strategy for every implementation batch.
- Stop after a failed implementation and recover the last stable state before continuing.
- Do not combine experimental work with accepted implementation work.
- Do not leave partial UI states that block existing business workflows.

## 12. Visual Implementation Rules

Implementation must use:

- Approved Design Tokens.
- Approved Component Library.
- Approved Layout Patterns.
- Approved Module Wireframes.
- Approved Premium UI Prototype guidance.

Implementation must not invent:

- New colors.
- New spacing scale.
- New components.
- New layouts.
- Generic admin template style.
- Module-specific visual language.
- Unapproved interaction behavior.

If a design token, component, layout, or wireframe gap is found, stop and propose a documentation
update before inventing a local solution.

## 13. Keyboard and Accessibility Rules

Implementation must preserve:

- Keyboard-first Billing.
- Predictable focus order.
- Visible focus.
- Search-first workflow.
- Shortcut behavior.
- Escape/Enter behavior where approved.
- Non-color-only status communication.
- Readable dense screens.
- Clear permission and error states.

Keyboard accessibility is mandatory for desktop productivity.

## 14. State Handling Rules

Every implemented screen must handle:

- Empty state.
- Loading state.
- Error state.
- Permission state.
- Licensing state.
- Background processing state.

State handling must be:

- Compact.
- Clear.
- Professional.
- Non-technical.
- Consistent with official terminology.
- Non-disruptive unless user correction is required.

## 15. Validation Rules

Validation must include, where relevant:

- Lint.
- Tests.
- Manual UI checklist.
- Regression checks for nearby workflows.
- Keyboard workflow check.
- Accessibility check.
- Desktop resolution check.
- Screenshot/review requirement when visual change is made.

Visual implementation is not complete until it has been reviewed against the approved product/design
documents.

## 15.1 Regression Protection Checklist

Regression checks must verify:

- Navigation.
- Keyboard shortcuts.
- Search.
- Filters.
- Dialogs.
- Tables.
- Forms.
- Notifications.
- Status areas.
- Printing.
- Existing business logic.

Regression protection must confirm that visual implementation did not weaken established workflows.

## 15.2 Performance and Responsiveness Expectations

Production UI implementation must protect desktop performance.

Expectations:

- Fast desktop startup.
- Responsive interactions.
- Minimal UI latency.
- Usable large datasets.
- Long-session stability.
- No visual polish that causes slow, heavy, or fragile interaction.

Performance is part of commercial product quality.

## 16. Commit Rules

Commit rules:

- Review before commit.
- One concern per commit.
- Meaningful commit messages.
- Stage only approved files.
- Do not mix documentation, UI, backend, and schema work unless explicitly approved.
- Do not push unless instructed.

## 17. Escalation Rules

Stop and ask/propose if:

- Schema change is needed.
- Backend change is needed.
- Preload change is needed.
- Architecture conflict is found.
- Approved terminology conflict is found.
- Design token gap is found.
- Component gap is found.
- Layout pattern gap is found.
- Module wireframe gap is found.
- Premium visual guidance conflict is found.
- Business logic change appears necessary.

When conflict is found, report the conflict before proceeding.

## 17.1 Implementation Report Format

Every implementation report should include:

- Root Cause.
- Files Changed.
- Architecture Impact.
- Validation.
- Regression Areas Checked.
- Known Limitations.
- Recommendation.

Reports must be concise, reviewable, and specific enough for the Product Owner to approve or reject
the implementation safely.

## 18. Phase Plan

Phase A:

- Implementation Standards.

Phase B:

- Billing Reference Implementation.

Phase C:

- Review and acceptance.

Phase D:

- Rollout to other modules.

Rollout must happen only after Billing is accepted as the reference implementation.

## 18.1 Module Rollout Order

Recommended rollout order after Billing acceptance:

1. Dashboard.
2. Products.
3. Customers.
4. Suppliers.
5. Purchases.
6. Inventory.
7. Reports.
8. Analytics.
9. Growth.
10. Control.
11. Platform.

Future rollout:

- CRM.
- HR.
- Manufacturing.
- Accounting.
- Projects.
- Service Management.
- Plugins.

The rollout order may be adjusted by Product Owner approval when business urgency, risk, or module
dependencies require a different sequence.

## 19. Relationship to Future Work

Future UI modernization must use Billing as the accepted reference before expanding to other
modules.

Future rollout order should consider:

- Workflow importance.
- User frequency.
- Risk.
- Module readiness.
- Business value.
- Dependency on shared patterns.

Future Web, Cloud, Mobile, and ERP editions must preserve the approved product/design foundation
while adapting appropriately to their platforms.

## 20. Governance Rules

This document governs how approved design becomes production UI.

Rules:

- No implementation without approved scope.
- No backend changes hidden inside UI work.
- No schema changes hidden inside visual work.
- No design system drift.
- No terminology drift.
- No module-specific design language.
- No unapproved architecture changes.
- No unreviewed visual implementation.

If implementation cannot follow this document, stop and request approval before proceeding.

## Final Principle

Implementation must translate approved product/design decisions into production UI faithfully.

The goal is not just a better-looking interface. The goal is a faster, clearer, more commercial, and
more trustworthy Enterprise POS.

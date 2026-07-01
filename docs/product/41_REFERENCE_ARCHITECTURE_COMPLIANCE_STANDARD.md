# Reference Architecture Compliance Standard

Document: Reference Architecture Compliance Standard  
Version: 1.0  
Status: Draft  
Scope: Module Architecture Compliance  
Applies To: Enterprise POS feature modules and renderer modules  
Depends On: Documents 20-40

## 1. Purpose

This document defines the architecture compliance standard learned from the completed Architecture
Reference modules before the next implementation rollout begins.

Its purpose is to preserve the reference architecture pattern across future modules without treating
any single module as functionally complete, installer-ready, or production mature by default.

## 2. Applies To

This standard applies to every module that is moved toward Architecture Reference status, including
existing feature modules, future ERP modules, renderer-owned screens, and read-only monitoring
modules.

It applies especially when preparing modules for implementation rollout after the Governance
Foundation.

## 3. Reference Modules

The current Architecture Reference modules are:

- Billing
- Products
- Customers
- Dashboard
- Suppliers

These modules establish implementation patterns for renderer ownership, API wrapper boundaries,
FeatureGate safety, lifecycle cleanup, and safe placeholder handling.

Reference status means architecture readiness only. It does not imply full feature completeness,
installer readiness, or production maturity.

## 4. Required Module Shape

A compliant module should follow the approved architecture:

Renderer -> API Wrapper -> Preload -> Controller -> Service -> Repository -> Database

Where applicable, each module should have clear ownership boundaries:

- Renderer owns UI rendering, UI state, and event binding.
- API wrapper owns renderer-side calls to `window.posApi`.
- Preload owns safe exposure of approved APIs.
- Controller coordinates request handling.
- Service owns business rules.
- Repository owns database access.
- Database/schema owns table definitions and migrations.

No module should mix unrelated feature ownership into another module unless an approved architecture
decision explicitly permits a temporary bridge.

## 5. Renderer Rules

Renderer files must remain UI-only.

Renderer files may:

- Render UI.
- Bind UI events.
- Maintain temporary UI state.
- Show empty, loading, error, permission, and unavailable states.
- Call the module API wrapper where applicable.
- Expose lifecycle functions when useful.

Renderer files must not:

- Call `ipcRenderer` directly.
- Access database connections.
- Execute SQL.
- Call `getPool()`.
- Access `fs` or main-process APIs directly.
- Contain backend business rules.
- Own service-layer calculations.
- Create hidden activation paths for unfinished features.
- Add console logging as runtime behavior.

Renderer code must remain replaceable by a future UI implementation without requiring backend or
business logic rewrites.

## 6. API Wrapper Rules

Module API wrappers are renderer-side boundary files.

An API wrapper may:

- Call `window.posApi`.
- Normalize preload responses.
- Return structured data to the renderer.
- Perform FeatureGate checks for renderer-triggered actions.
- Provide unavailable responses for placeholder actions.
- Wrap approved external actions where required.

An API wrapper must not:

- Manipulate the DOM.
- Render HTML.
- Attach events.
- Own UI state.
- Execute SQL.
- Call `ipcRenderer` directly.
- Access database connections.
- Contain business workflows that belong in services.

API wrappers exist to keep renderer files UI-focused while preserving the approved preload boundary.

## 7. Lifecycle Rules

Modules should expose lifecycle methods when useful for route ownership, cleanup, refresh, or future
UI replacement.

Recommended lifecycle functions:

- `renderUI(state)`
- `updateUI(diff)`
- `destroyUI()`

Lifecycle methods should be real and honest. If a lifecycle function is not yet meaningful, it may
be documented as a TODO rather than pretending to perform cleanup.

Lifecycle cleanup should remove temporary UI timers, close module overlays, clear route-local UI
state where appropriate, and avoid duplicate event registration.

## 8. Placeholder / Future Feature Rules

Placeholder, incomplete, risky, or future-phase features must not appear as fully active production
workflows.

Such features must be one of:

- Hidden.
- Disabled.
- Clearly unavailable.
- FeatureGate-protected.
- Installer-disabled.
- Documented as future-phase.

Placeholder actions must not execute partial financial, destructive, sync, import/export,
return/exchange, or external workflows.

No placeholder may create the impression that an incomplete feature is installer-ready.

## 9. FeatureGate Usage Rules

FeatureGate is used to prevent accidental activation of SAFE, GUARDED, LOCKED, or future-phase
functionality.

FeatureGate usage must:

- Protect guarded and locked renderer-triggered actions.
- Fail safely when the gate is unavailable.
- Prevent external navigation bypasses where applicable.
- Keep locked features non-executable.
- Avoid changing business logic.

FeatureGate must not become a replacement for service-layer authorization, RBAC, licensing, or
future platform authorization.

## 10. Backend Boundary Rules

Backend ownership remains:

Controller -> Service -> Repository -> Database

Controllers should coordinate requests and responses.

Services should own business rules, validation, permissions, and workflow decisions.

Repositories should be the only feature layer that executes SQL or uses database connections.

Renderer or API-wrapper work must not hide backend behavior changes.

## 11. Preload / IPC Rules

Preload and IPC changes require explicit approval.

No module alignment task may silently add, rename, or repurpose IPC routes.

Renderer modules must use approved preload APIs through `window.posApi` only, and preferably through
a module API wrapper.

Direct `ipcRenderer` usage in renderer modules is prohibited.

## 12. Schema Change Rule

No schema change may be introduced during architecture alignment without a documented schema
proposal and owner approval.

Architecture Reference work must preserve existing tables, columns, constraints, seed data, and
migration behavior unless a schema change is explicitly approved.

## 13. Permission / RBAC Rule

Permission and RBAC behavior must not be redesigned during module alignment.

If module-specific permission helpers already exist, they may be used without touching unrelated
systems.

If using correct module permissions requires wider RBAC, preload, main-process, schema, or
permission-system changes, the limitation must be documented instead of forced.

Known permission limitations must not block renderer/API boundary cleanup unless they create an
immediate security or data-loss risk.

## 14. Review Checklist

Every Architecture Reference review must verify:

- Renderer is UI-only.
- Renderer has no direct `window.posApi` where a module API wrapper exists.
- Renderer has no `ipcRenderer`, SQL, database, `getPool()`, `fs`, or main-process access.
- API wrapper returns structured data only.
- API wrapper has no DOM manipulation.
- Module script load order is correct.
- Existing UI and behavior are preserved.
- FeatureGate protects guarded or locked actions.
- Placeholder actions do not activate unfinished features.
- Backend, preload, IPC, schema, and FeatureGate core are unchanged unless explicitly approved.
- HOLD files remain untouched.
- Known limitations are reported clearly.

## 15. Commit Safety Checklist

Before staging an Architecture Reference change:

- Confirm the staged files match the approved scope.
- Exclude unrelated files and HOLD files.
- Run syntax checks for touched JavaScript files.
- Run applicable project validation.
- Review `git diff` for every staged file.
- Confirm no schema, preload, IPC, or backend change is hidden inside renderer work.
- Confirm documentation accurately reports remaining limitations.
- Keep the commit focused on one module and one architecture concern.

## 16. Known Exceptions

### Login/Auth Deferred

Login and authentication still contain route orchestration and approved application-level access
checks. Login/Auth cleanup is deferred and must not be mixed into feature-module alignment without
explicit scope approval.

### Lucky Draw V2 HOLD

Lucky Draw V2 is on HOLD. Existing modifications in Lucky Draw V2 files must not be touched, staged,
committed, or used as part of Architecture Reference rollout unless that HOLD is explicitly lifted.

### Suppliers Permission Helper Limitation

Suppliers currently has supplier permission records, but no supplier-specific permission helper was
available during Suppliers alignment. `suppliers.service.js` therefore retains the existing
Purchases permission helper usage as a known limitation.

This limitation must not be silently expanded into RBAC redesign. It requires a separate
permission/RBAC task if the owner approves it.

### Dashboard Renderer Ownership Pattern

Dashboard is the read-only monitoring reference pattern. Dashboard renderer ownership demonstrates
route lifecycle, refresh lifecycle, widget rendering, empty/error states, and cleanup for read-only
modules.

Dashboard reference status does not imply new analytics, new dashboard features, or commercial
dashboard completeness.

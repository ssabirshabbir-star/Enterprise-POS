# Enterprise POS Project Constitution

## 1. Project Purpose

Enterprise POS is a desktop-first commercial point-of-sale system for grocery and retail operations.
The project must prioritize data integrity, stable day-to-day cashier workflows, inventory accuracy,
receipt reliability, and a maintainable architecture that can later support LAN and cloud-connected
deployments.

The approved production direction is:

- Electron
- JavaScript
- HTML
- CSS
- Tailwind
- PostgreSQL

No TypeScript, Prisma, React, Vue, Vite, or new frontend framework may be introduced without
explicit architecture approval.

## 2. Product Direction

Enterprise POS is an offline-capable desktop application first. PostgreSQL is the primary database.
The architecture must remain compatible with future LAN, multi-terminal, and cloud sync expansion,
but current work must not add cloud or network complexity unless it has been approved as a focused
module.

Electron must act as the desktop shell and secure bridge. Business logic belongs in the main-process
feature layers, not in the renderer.

## 3. Mandatory Architecture

All modules must follow this flow:

Renderer -> Preload -> Controller -> Service -> Repository -> Database

Responsibilities:

- Renderer: UI rendering, event binding, display state only.
- Preload: safe `window.posApi` bridge only.
- Controller: IPC boundary only.
- Service: validation, authorization decisions, business rules.
- Repository: SQL only.
- Database: PostgreSQL schema, constraints, indexes, and persisted data.

No layer may skip the layer below it.

## 4. Renderer Rules

Renderer code must:

- Use `window.posApi` only for system access.
- Never import or call `ipcRenderer` directly.
- Never import repositories, services, database helpers, or DB pools.
- Never contain SQL.
- Never contain business rules that belong in services.
- Keep calculations limited to UI display unless the value is revalidated in service.

Renderer code may:

- Bind UI events.
- Render tables, forms, modals, and messages.
- Read form/filter values.
- Call `window.posApi`.
- Display responses returned from the approved API.

## 5. Main-Process Rules

Controllers must:

- Register IPC channels.
- Call the correct service.
- Return safe response shapes.
- Avoid unsafe stdout/stderr logging.

Services must:

- Validate input.
- Enforce permissions.
- Own business decisions.
- Call repositories.
- Avoid SQL.

Repositories must:

- Own SQL queries and transactions.
- Map database rows into stable objects.
- Avoid UI decisions.
- Avoid direct renderer assumptions.

## 6. Module Rules

Work must proceed one module at a time.

Every module change must follow:

1. Audit first.
2. Report findings.
3. Get approval before implementation.
4. Apply the minimum safe change.
5. Validate.
6. Commit before starting the next module.

No unrelated refactoring is allowed inside a module task. Stabilized modules must not be touched
unless the task explicitly approves it or a confirmed blocker requires it.

Current stabilized modules include:

- Billing stabilization
- Lucky Draw V2 auto-entry path
- Sales History / Completed Invoices

## 7. God File Rule

Target file size is under 500 lines.

- Over 500 lines: warning, future split required.
- Before 1000 lines: split must be planned.
- At or above 1000 lines: split is mandatory before adding more behavior.

No file may combine UI, business logic, and database access.

## 8. Git Workflow

Before work starts:

- Confirm branch.
- Confirm clean working tree.
- Confirm latest committed state.

Before commit:

- Run validation commands required by the task.
- Review diff scope.
- Stage only approved files.

After commit:

- Confirm clean working tree.
- Do not push unless explicitly instructed.

## 9. Security Rules

Security rules are mandatory:

- No secrets in the repository.
- Production environment files must live outside source control.
- Renderer must never access the database.
- Main-process logging must not crash the app.
- Avoid unsafe `console.log`, `console.warn`, `console.error`, stdout, or stderr writes in
  production main-process paths.
- IPC responses must not expose internal stack traces or SQL errors to the renderer.

## 10. Database Rules

PostgreSQL is the primary database.

Schema and migration changes require explicit approval. Foreign key, constraint, index, and
integrity changes require a focused audit before implementation.

Repositories must use parameterized queries. Renderer and service files must not contain SQL.

## 11. Printing and Receipt Rules

Receipt, reprint, PDF, and thermal printing work must use the existing printing module. Do not
duplicate receipt rendering or printer logic in feature modules unless explicitly approved.

Sales History and Billing must request printing through the approved printing API.

## 12. Lucky Draw Rule

Lucky Draw V2 is the only approved auto-entry path for Billing sales. Legacy `lucky-draw` code must
not be used for new work or Billing auto-entry.

Historical legacy files may remain until a separate deprecated artifact cleanup task is approved.

## 13. Completed Milestones

The current foundation includes these completed or stabilized milestones:

- Auth/session restore
- Dashboard stabilization
- Billing stabilization
- Lucky Draw V2 auto-entry
- Products basic functional fixes
- Inventory basic functional fixes
- Customers basic functional fixes
- Suppliers basic functional fixes
- Sales History / Completed Invoices v1

## 14. Remaining Backlog

Remaining foundation and commercial hardening work includes:

- Returns
- Purchases
- Purchase Orders
- Reports
- Users/RBAC
- Settings
- Expenses
- Dashboard polish
- Installer/production hardening
- Logging cleanup
- Deprecated artifact cleanup
- Backup/restore hardening
- LAN/cloud readiness
- Printing reliability
- Database integrity hardening

## 15. Constitution Amendment Policy

The Project Constitution is the default authority for architecture and development rules. It is not
permanent or untouchable. If a better architecture, safer pattern, or stronger commercial foundation
is identified, the Constitution may be updated through a controlled amendment process.

No agent, developer, or assistant may silently violate the Constitution. If a task appears to
require breaking an existing rule, work must stop and an Architecture Change Proposal must be
prepared first.

A Constitution rule may be bypassed only in these cases:

1. Emergency bug fix to restore a broken app.
2. Security fix.
3. Data-loss prevention.
4. Explicit owner-approved architecture migration.
5. Temporary compatibility bridge during refactor.

Before violating or changing a rule, prepare:

1. Current rule.
2. Reason it is insufficient.
3. Proposed new rule.
4. Risks of changing.
5. Risks of not changing.
6. Files/modules affected.
7. Rollback plan.
8. Validation plan.
9. Owner approval.

If temporary deviation is approved, it must include:

- Clear reason.
- Time limit or cleanup phase.
- Pending Register entry.
- Validation checks.
- Follow-up cleanup task.

Agents must never decide alone to break architecture rules. They must stop and report:

`Architecture rule conflict found. Approval required before proceeding.`

The owner may approve a rule change, but the change must be documented before implementation.

Better architecture is allowed. Silent architecture drift is not allowed.

## 16. Final Principle

Protect working business flows first. New features, cleanup, and polish must not break completed
cashier, billing, inventory, customer, supplier, Lucky Draw V2, or Sales History behavior.

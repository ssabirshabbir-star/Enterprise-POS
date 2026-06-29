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

## 3. Product Philosophy

Enterprise POS must remain commercial POS first. The primary deliverable is a fast, simple,
commercial point-of-sale system. ERP capabilities are optional future extensions and must not make
the default cashier or store-owner experience slower or more complex.

The product must follow these permanent design principles:

- Commercial POS First: fast cashier workflows, clear inventory behavior, reliable receipts, and
  simple day-to-day operations take priority over ERP depth.
- Automation Before Configuration: software should automate repetitive work whenever accuracy can be
  maintained. Ask the user only when automation is insufficient.
- One-Time Data Entry: the same business information should never be requested repeatedly when it
  already exists.
- Progressive Complexity: default UI must remain simple. Advanced capabilities appear only when
  required by the licensed edition or enabled feature.
- Click Reduction: every new feature should reduce user effort rather than increase it. Developers
  should prefer fewer clicks, fewer dialogs, and fewer manual steps.
- Zero Surprise UX: automation must behave predictably. Users should understand why the software
  made a decision.
- Commercial Licensing: paid capabilities must always be enforced by the licensing layer. Feature
  flags are configuration tools, not security mechanisms.
- Smart Automation Foundation: the software must compete through speed, simplicity, fewer clicks,
  fewer mistakes, automation before manual entry, and predictable AI-assisted workflows.

Platform Owner access is separate from customer accounts. Platform Owner capabilities include:

- License management.
- Emergency lockdown.
- Device revocation.
- Master identity rotation.
- Diagnostic mode.

These capabilities must never be available to customer administrators.

AI-assisted features are optional paid capabilities. They may be introduced later only if they
reduce user effort and do not create confusion. AI must assist the user, not replace business
control.

AI-assisted capabilities must be:

- Disabled by default.
- Controlled by license entitlement.
- Optionally hidden by Feature Flags.
- Unavailable to customer administrators unless licensed.
- Non-blocking for core POS workflows.
- Protected in service and authorization layers, not protected by UI visibility alone.

Future AI-assisted workflows are reserved for:

- Smart product suggestions.
- Barcode-based product enrichment.
- Purchase invoice parsing.
- Duplicate product detection.
- Stock reorder suggestions.
- Customer behavior insights.
- Natural language reports.
- Anomaly detection.

These workflows must not be implemented until explicitly approved as focused modules or features.

## 4. Mandatory Architecture

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

## 5. Renderer Rules

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

## 6. Main-Process Rules

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

## 7. Module Rules

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

## 8. God File Rule

Target file size is under 500 lines.

- Over 500 lines: warning, future split required.
- Before 1000 lines: split must be planned.
- At or above 1000 lines: split is mandatory before adding more behavior.

No file may combine UI, business logic, and database access.

## 9. Git Workflow

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

## 10. Security Rules

Security rules are mandatory:

- No secrets in the repository.
- Production environment files must live outside source control.
- Renderer must never access the database.
- Main-process logging must not crash the app.
- Avoid unsafe `console.log`, `console.warn`, `console.error`, stdout, or stderr writes in
  production main-process paths.
- IPC responses must not expose internal stack traces or SQL errors to the renderer.

## 11. Platform Security & Licensing Architecture

Platform Security is a reserved future platform service. It is independent from customer users,
customer roles, RBAC, store configuration, and business modules.

Platform Owner identity is not a customer account. Platform Owner authority exists above customer
organizations and must remain completely separate from:

- Store Owner.
- Administrator.
- Manager.
- Cashier.

Commercial editions are controlled only by the Licensing Layer. Feature Flags are configuration.
Licensing is authorization. These are different concepts.

Paid capabilities must never become available by:

- Editing configuration.
- Editing database values.
- Editing local JSON.
- Enabling hidden UI.
- Changing Feature Flags.

Only a valid license may activate commercial capabilities.

Future platform operations are reserved for:

- License activation.
- License revocation.
- Device registration.
- Device revocation.
- Session revocation.
- Emergency lockdown.
- Master identity rotation.
- Diagnostic mode.
- Support mode.

These operations must not be implemented until explicitly approved as a focused platform module.

Every commercial capability must be protected at:

- UI layer.
- API layer.
- Service layer.
- Authorization layer.

Hidden UI is never enough protection.

Commercial software protection must be designed for all future platforms:

- Windows installer.
- Installed desktop app.
- Future web app.
- Future mobile app.
- Backend APIs.
- License files.
- Update system.

Commercial protection rules:

- No paid feature may rely only on hidden UI.
- No paid feature may rely only on local database flags.
- No paid feature may rely only on editable config files.
- Licenses must be signed.
- Feature access must be checked in service and authorization layers.
- Future builds should support tamper detection.
- Future builds should support device binding.
- Future builds should support remote revocation where internet is available.
- Installer and app packaging should reduce casual copying and repackaging.
- Audit trail should record sensitive platform actions.

No commercial software is absolutely uncrackable. The project goal is layered protection, license
enforcement, tamper resistance, auditability, and fast revocation.

Future protections against unauthorized resale or rebranding are reserved for:

- Signed license identity.
- Edition branding validation.
- Customer/license metadata.
- Update channel validation.
- Support-mode verification.
- Platform-owner revocation.

These protections must not be implemented until explicitly approved as focused platform work.

The future module boundary is reserved as `src/main/platform/`, without creating that directory
until implementation is approved. Possible future submodules include:

- `licensing`
- `owner`
- `devices`
- `sessions`
- `diagnostics`
- `audit`
- `support`

## 12. Database Rules

PostgreSQL is the primary database.

Schema and migration changes require explicit approval. Foreign key, constraint, index, and
integrity changes require a focused audit before implementation.

Repositories must use parameterized queries. Renderer and service files must not contain SQL.

## 13. Printing and Receipt Rules

Receipt, reprint, PDF, and thermal printing work must use the existing printing module. Do not
duplicate receipt rendering or printer logic in feature modules unless explicitly approved.

Sales History and Billing must request printing through the approved printing API.

## 14. Lucky Draw Rule

Lucky Draw V2 is the only approved auto-entry path for Billing sales. Legacy `lucky-draw` code must
not be used for new work or Billing auto-entry.

Historical legacy files may remain until a separate deprecated artifact cleanup task is approved.

## 15. Completed Milestones

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

## 16. Remaining Backlog

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

## 17. Constitution Amendment Policy

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

## 18. Final Principle

Protect working business flows first. New features, cleanup, and polish must not break completed
cashier, billing, inventory, customer, supplier, Lucky Draw V2, or Sales History behavior.

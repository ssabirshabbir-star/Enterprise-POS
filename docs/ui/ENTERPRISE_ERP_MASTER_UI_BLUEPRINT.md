# Enterprise ERP Master UI Blueprint v1.0

## Document Metadata

| Field | Value |
| --- | --- |
| Document | Enterprise ERP Master UI Blueprint |
| Version | 1.0 |
| Status | Final — Pending Formal Approval |
| Authority | Final UI design authority for all future UI work |
| Scope | Enterprise POS first edition and all future ERP expansion editions |
| Branch | upgrade/foundation-v1 |
| Depends On | Doc 20, Doc 22, Doc 23, Doc 24, Doc 25 |
| Supersedes | All module-level UI decisions that contradict this document |
| Controls | All future module UI prompts, renderer decisions, layout decisions, action placements, and component choices |
| Lower Authority | Module UI specifications, renderer implementations, HTML, CSS |

---

## Table of Contents

1. Purpose
2. Authority Hierarchy
3. Core UI Principles
4. Replaceable UI Doctrine
5. Navigation Blueprint
6. Role-Based UI Blueprint
7. Screen Pattern Blueprint
8. Information Architecture Blueprint
9. Action Architecture Blueprint
10. Progressive Disclosure Blueprint
11. Component Blueprint
12. Design Token Blueprint
13. Layout Blueprint
14. Reports Blueprint
15. Dashboard Blueprint
16. Module Blueprint Summary
17. Current Implementation Misalignment Register
18. Future ERP Expansion Rules
19. Implementation Control Rules
20. Final Decision

---

## 1. Purpose

This document is the **single authoritative UI reference** for Enterprise POS and all future ERP expansion editions.

It synthesises the following accepted inputs:

- `20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md` — approved product experience decisions
- `22_PRODUCT_DESIGN_CONSTITUTION.md` — design philosophy and governance
- `23_DESIGN_TOKENS.md` — token system categories and intent
- `24_COMPONENT_LIBRARY_SPECIFICATION.md` — reusable component definitions
- `25_LAYOUT_PATTERNS.md` — layout principles and workspace patterns
- `ERP-UI-BLUEPRINT-AUDIT-v1.0` — Phase 1 UI audit findings
- `ERP-UI-ARCH-FOUNDATION-v1.0` — Phase 2 architectural analysis
- `ERP-UI-RECONCILIATION-v1.0` — foundation reconciliation review

This Blueprint does not introduce new architectural decisions. It records, consolidates, and enforces decisions already made across the above documents.

### What This Document Governs

- Navigation structure and workspace organisation
- Role-based UI behaviour
- Screen patterns and layout rules
- Information hierarchy across all modules
- Action categorisation and placement
- Progressive disclosure rules
- Component standards
- Design token intent
- Reports, dashboard, and module UI direction
- Implementation misalignment register
- ERP expansion UI rules
- Future implementation control

### What This Document Does Not Govern

- CSS implementation strategy
- Specific CSS class names or file architecture
- HTML structure
- IPC API design
- Backend service logic
- Database schema
- Deployment or build pipeline

---

## 2. Authority Hierarchy

All UI design decisions in this project follow a strict authority chain. Lower documents must follow higher documents. If a lower document conflicts with a higher one, the lower document must be revised.

```
Project Constitution
        |
Architecture Rules
        |
20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md       <- Approved
        |
21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md
        |
22_PRODUCT_DESIGN_CONSTITUTION.md
        |
23_DESIGN_TOKENS.md
        |
24_COMPONENT_LIBRARY_SPECIFICATION.md
        |
25_LAYOUT_PATTERNS.md
        |
ENTERPRISE_ERP_MASTER_UI_BLUEPRINT.md (this document)
        |
Module Wireframes (doc 26 and future)
        |
UI Prototype documents
        |
Implementation Standards
        |
Module-level UI prompts, renderer implementations, HTML, CSS
```

### Rules

1. No renderer, module prompt, or HTML implementation may contradict this Blueprint without formal approval.
2. If an implementation task requires breaking this Blueprint, work must stop and the conflict must be reported.
3. Phase 2 blocking gaps K01-K09 identified in the architectural analysis have been resolved by the reconciliation review. They are not open decisions.
4. CSS architecture is implementation-level and not subject to Blueprint governance. The Blueprint governs design intent; CSS strategy is downstream.

---

## 3. Core UI Principles

These principles govern every UI decision in Enterprise POS and future ERP editions. They are derived from Doc 20 and Doc 22 and restated here as operational rules.

### P1 — Cashier Speed Is Inviolable

The cashier billing workflow is the highest-priority workflow in the system. No ERP feature, management control, or administrative function may increase friction in the cashier path. The sale must always be the shortest path.

### P2 — Progressive Complexity

The default experience must remain simple. Advanced capabilities — ERP depth, multi-warehouse, approval workflows, tax rules — appear only when licensed, enabled, permission-allowed, relevant, and needed. Simple retail users must not carry enterprise complexity.

### P3 — Role-Aware Experience

Every role in the system must land in the right context with the right information and the right actions. Operators should not need to navigate past irrelevant module clutter to reach their primary workflow.

### P4 — Low Cognitive Load

Screens must reduce operator effort, not increase it. Actions must be obvious. Status must be visible. Results must be predictable. The operator should understand what happened, why it happened, and what they can do next.

### P5 — Desktop-First, Future-Compatible

Enterprise POS is designed for desktop operation: keyboard-first, large monitors, long sessions, scanner-optimised. Future web, cloud, mobile, and companion editions must adapt without breaking the core philosophy.

### P6 — Replaceable UI Forever

The UI must remain replaceable at all times. Screen fragments, renderers, and CSS are contracts, not permanent structures. No business logic may live in renderers. No renderer may be tightly coupled to the global shell.

### P7 — Commercially Premium

The product must look and feel commercially serious. It must inspire operational confidence before training begins. It must not look generic, toy-like, template-based, or crowded.

### P8 — Zero Surprise UX

Operators must always understand what they did, what happened, and what is available next. Ambiguous states, silent failures, and misleading placeholders are not acceptable.

### P9 — Productivity Before Beauty

When visual polish conflicts with operator productivity, productivity wins. Beauty is a business feature only when it does not reduce speed, readability, or workflow clarity.

### P10 — Consistent Product Family Feel

All modules must feel like members of the same product. Terminology, action placement, table behaviour, form behaviour, status language, and feedback patterns must be consistent regardless of which module the operator is using.

---

## 4. Replaceable UI Doctrine

The UI must remain replaceable forever. This is a non-negotiable architectural commitment that governs all implementation decisions.

### 4.1 Replacement Levels

**Primary replacement target — Screen / Module level**

Each module's HTML fragment, CSS file, and renderer are the primary replacement unit. Replacing one module's UI must not require changes to any other module or the global shell, unless the shell itself is also being replaced.

**Long-term replacement target — Component level**

Once the component library (EposUI primitives and future approved components) achieves full adoption across renderers, individual components can be replaced without touching the surrounding screen. This is the target state.

**Theme replacement — Token level**

Visual identity (colours, typography, spacing, shadow, density) must be replaceable via the design token system without changing component structure or renderer logic.

**Shell replacement — Future option**

The application shell (sidebar, header, routing) may be replaced in a future edition to support a different navigation paradigm (e.g. web-first shell, mobile-first shell) while keeping all module fragments intact. Shell replacement requires formal planning and is not a current milestone.

### 4.2 Replaceable UI Rules

| Rule | Statement |
| --- | --- |
| R1 | No business logic (calculations, stock updates, approval transitions, financial operations) may live in any renderer. |
| R2 | Renderers must communicate with the backend exclusively through the module's .api.js IPC shim layer. |
| R3 | Each module's HTML must live in its own features/[module]/index.html fragment. |
| R4 | No module-specific form may be embedded in the global shell (renderer/index.html) unless it is formally designated as a shell-level overlay. |
| R5 | Each module's CSS must live in its own features/[module]/[module].css file. |
| R6 | Renderers must use the IIFE pattern with AbortController for event cleanup. |
| R7 | No module may store persistent state in the global shell. |
| R8 | The Purchase Orders renderer is the reference implementation for all future renderers. |

### 4.3 Known Current Violation

The Products module product form (productFormPanel) is currently embedded in the global shell renderer/index.html. This violates Rules R3 and R4. The Products module is the **only module classified as NOT READY for replaceable UI**. This must be corrected before the Products screen blueprint is ratified for implementation.

---

## 5. Navigation Blueprint

### 5.1 Decided Navigation Model

**Persistent Left Navigation with Business Workspace Families**

This decision was made in Doc 20 sections 3, 4, and 15. It is final and not subject to re-evaluation at the module or implementation level.

### 5.2 Workspace Family Structure

The sidebar must be organised into business families, not a flat uncontrolled module list. The seven permanent workspace families are:

| Workspace | Modules |
| --- | --- |
| **Sell** | Billing, Returns, Completed Invoices / Sales History |
| **Stock** | Products, Inventory, Purchases, Purchase Orders, Suppliers |
| **Customers** | Customers, Credit Ledger, Customer Payments |
| **Money** | Expenses, Reports, Sales Summaries, Profit Views |
| **Growth** | Lucky Draw, Promotions (future), Loyalty (future) |
| **Control** | User Management, Roles, Settings, Backup / Restore |
| **Platform** | Licensing (future), Device Control (future), Diagnostics (future) |

### 5.3 Navigation Governance Rules

1. **The sidebar must not remain a flat module list.** As the product grows, workspace grouping is mandatory.
2. **Navigation must become role-aware.** Modules visible in the sidebar must match the current user's role and permissions.
3. **Hidden navigation:** Modules that are out of scope, not yet activated, or not licensed for the current installation are hidden from the sidebar entirely.
4. **Locked navigation:** Modules that exist and are licensed but are restricted by role show as visible navigation items with a lock indicator.
5. **Emoji icons must be replaced** with a consistent SVG icon set. Two current modules share the same emoji icon — a registered misalignment.
6. **The brand label** in the sidebar must be made configurable, not hardcoded.

### 5.4 Future Navigation Capabilities

The following navigation capabilities are planned and must be accommodated in layout and shell decisions:

- Favorites — operator-pinned modules
- Recent items — recently viewed records
- Search-first navigation — command palette (Ctrl+K equivalent)
- Workspace collapse — sidebar rail mode

---

## 6. Role-Based UI Blueprint

### 6.1 Decided Model

**Role-Aware Workspace Shell with Role-Based Default Landing Screens**

This decision was made in Doc 20 sections 5 and 15. It is final.

### 6.2 Role Definitions

#### Cashier

| Property | Value |
| --- | --- |
| Default landing | Billing |
| Visible workspaces | Sell |
| Primary workflows | Sale completion, receipt, customer selection |
| Hidden / restricted | Stock management, purchasing, ERP controls, reports, user management |
| Dashboard | None — Billing is the workspace |

#### Store Manager

| Property | Value |
| --- | --- |
| Default landing | Store Health Dashboard |
| Visible workspaces | Sell, Stock, Customers, Money, Control (limited) |
| Primary workflows | Daily sales review, stock alerts, purchase oversight, customer dues, returns monitoring, staff activity |
| Hidden / restricted | User creation, platform settings, licensing |
| Dashboard | Critical alerts, today's performance, operational snapshot, quick links |

#### Warehouse

| Property | Value |
| --- | --- |
| Default landing | Inventory |
| Visible workspaces | Stock |
| Primary workflows | Stock management, GRN receiving, inventory adjustment, purchase visibility |
| Hidden / restricted | Billing, customer management, financial reports, user management |
| Dashboard | Stock health summary — low stock, out of stock, recent movements |

#### Purchasing

| Property | Value |
| --- | --- |
| Default landing | Purchase Orders |
| Visible workspaces | Stock (Purchase Orders, Purchases, Suppliers) |
| Primary workflows | PO creation, PO status tracking, GRN coordination, supplier management |
| Hidden / restricted | Billing, customer management, financial reports |
| Dashboard | Pending PO summary, supplier payment summary |

#### Accountant

| Property | Value |
| --- | --- |
| Default landing | Money workspace — Reports |
| Visible workspaces | Money, Customers (ledger view), Stock (Suppliers — ledger and payments only) |
| Primary workflows | Financial reports, supplier ledger, customer ledger, expense management, supplier payments |
| Hidden / restricted | Billing, stock adjustment, product management, user management |
| Dashboard | Financial KPI summary — dues, payables, cash position, expense totals |
| Note | Accountant must be added to READ_ROLES in suppliers, reports, expenses, and customers permission files. Currently absent despite being a system role. |

#### Owner

| Property | Value |
| --- | --- |
| Default landing | Owner Command Center (role-specific dashboard) |
| Visible workspaces | All workspaces |
| Primary workflows | Profit visibility, cash position, sales trend, stock value, dues and payables, expense review |
| Hidden / restricted | Day-to-day operational forms |
| Dashboard | P&L indicators, cash flow, top products, top customers, outstanding dues, expense breakdown |

#### Administrator

| Property | Value |
| --- | --- |
| Default landing | Control workspace |
| Visible workspaces | All workspaces |
| Primary workflows | User management, role configuration, system settings, backup/restore |
| Hidden / restricted | Platform Owner tools |
| Dashboard | System health — active users, backup status, sync status |

#### Auditor / Support (Future)

| Property | Value |
| --- | --- |
| Default landing | Activity Log |
| Visible workspaces | Read-only access to all workspaces |
| Primary workflows | Activity log review, transaction audit, user action trace |
| Hidden / restricted | All write operations |
| Note | This role is not yet in the system role schema. Reserved for future governance activation. |

### 6.3 Shared Screens vs. Role-Specific Screens

- **Shared screens** are the standard. Most modules display the same screen with role-conditional action visibility.
- **Role-specific dashboards** are used at the landing screen level only.
- **Role-filtered navigation** hides workspaces and modules the role cannot access.
- **Role-conditional actions** within a shared screen show, disable, or hide buttons and sections based on the current user's role and permissions.

---

## 7. Screen Pattern Blueprint

### 7.1 Approved Screen Patterns

#### Dashboard / KPI Screen

**Purpose:** Operational situation awareness and decision support at a glance.

**Structure:** Critical alert strip → role-specific KPI cards → operational snapshots → quick action links → activity / chart area.

**Rules:**
- Dashboard must be role-aware. Cashier and manager dashboards are different screens.
- Deep analysis belongs in Reports, not on the Dashboard.
- Every KPI must link to the source module.

---

#### POS Workspace

**Purpose:** Fastest possible sale completion.

**Structure:** Search/scan command → cart → sale context (customer, cart tabs) → payment summary → payment actions → receipt actions → compact message area.

**Rules:**
- Scanner/search input always focused on entry.
- Cart, total, payment method, and Pay Now always visible.
- Advanced sale features appear only when needed.
- Billing is never a report, returns, or inventory screen.

---

#### Master-Detail Screen

**Purpose:** Browse a list of records and inspect or act on a selected record.

**Structure:** Module header (title + primary add action) → filter/search bar → data table → detail panel (slides in on row selection).

**Rules:**
- Filter controls remain near the data they control.
- Detail panel does not require a full screen transition for read-only inspection.
- Row actions are direct and minimal (maximum 3 direct icons).

**Modules:** Sales History, Products, Inventory, Purchases, Suppliers, Customers, User Management, Expenses.

---

#### Document Screen

**Purpose:** Create, manage, and track a complex business document through a defined lifecycle.

**Structure:** Document header (number, status badge, primary actions) → tab navigation → document content area → document action rail.

**Rules:**
- Document status drives visible actions.
- Primary workflow actions first; dangerous actions last.

**Modules:** Purchase Orders, future GRN screen, future Invoice screen, Lucky Draw.

---

#### Wizard / Stepper Screen

**Purpose:** Guide the operator through a sequential multi-step workflow.

**Structure:** Progress indicator → current step content → back/next controls → completion summary.

**Modules that need this pattern:** GRN receiving, Return processing, future Requisition-to-PO conversion.

---

#### Report Workspace

**Purpose:** Generate, view, and export a specific business report on demand.

**Structure:** Report family selector → date and context filters → run control → summary metrics → result table or chart → drill-down area → export/print controls.

**Rules:**
- Operators must choose a report family before data loads.
- Each report family has its own filter set.

**Modules:** Reports.

---

#### Status Board

**Purpose:** Display the current operational status of a system or queue.

**Structure:** Status summary → queue table → log section → limited action controls.

**Modules:** Sync Queue.

---

#### Configuration Screen

**Purpose:** Safe, deliberate system configuration.

**Structure:** Category navigation → current settings group → field descriptions → save/test/confirm → dangerous actions (collapsed, permission-protected).

**Rules:**
- Settings must feel calm, not like a dashboard.
- Each settings group has its own save/cancel.

**Modules:** Settings, future Platform settings.

---

### 7.2 Module-to-Pattern Mapping

| Module | Screen Pattern |
| --- | --- |
| Dashboard | Dashboard / KPI Screen |
| Billing | POS Workspace |
| Sales History / Completed Invoices | Master-Detail Screen |
| Products | Master-Detail Screen |
| Inventory | Master-Detail Screen |
| Purchases | Master-Detail Screen |
| Purchase Orders | Document Screen |
| Suppliers | Master-Detail Screen |
| Customers | Master-Detail Screen |
| Returns | Wizard / Stepper Screen |
| Reports | Report Workspace |
| Expenses | Master-Detail Screen |
| User Management | Master-Detail Screen |
| Settings | Configuration Screen |
| Sync Queue | Status Board |
| Lucky Draw | Document Screen (campaign-centric) |

---

## 8. Information Architecture Blueprint

### 8.1 Information Tier Definitions

**Primary Information — always visible, above the fold**
The most critical business data for the current operator's workflow. Never hidden, collapsed, or behind a tab.

**Secondary Information — visible on selection**
Important context relevant when a record is selected or a workflow is initiated.

**Reference Information — available on demand, one click away**
Data that supports a decision but is not needed for every interaction.

**Hidden Information — exists in database, no current UI surface**
Current examples: stock movements log, goods receipt detail, purchase requisitions, terminal registrations.

**Contextual Drill-Down — cross-module navigation via record relationship**
Invoice links to customer. PO links to resulting purchase. Sale links to inventory movement.

### 8.2 Information Hierarchy — Five Questions

Every screen must answer in visual order:

1. Where am I?
2. What is most important right now?
3. What can I do next?
4. What needs attention?
5. What details are available if I need them?

### 8.3 Cross-Module Workflow Traceability

**Sales Cycle:**
```
Billing -> Sales History -> Customer Profile -> Returns -> Reports -> Dashboard
```

**Procurement Cycle:**
```
Purchase Requisition -> Purchase Order -> GRN -> Inventory -> Purchase Invoice
    -> Supplier Ledger -> Supplier Payment -> Reports -> Dashboard
```

**Returns Cycle:**
```
Sales History -> Returns -> Inventory -> Customer Ledger -> Reports
```

### 8.4 Missing Cross-Module Navigation (Target State)

| Source | Destination | Purpose |
| --- | --- | --- |
| Sales History (invoice) | Customer Profile | View customer ledger |
| Sales History (invoice) | Returns | Initiate return against this invoice |
| Purchase Orders (PO) | Purchase Record | Trace resulting payable after invoicing |
| Purchase Orders (PO) | Supplier Ledger | Trace cost to supplier account |
| Dashboard (low stock alert) | Inventory (filtered) | Actionable link |
| Dashboard (due purchases) | Purchases (filtered) | Actionable link |
| Customers (customer) | Sales History (filtered) | Customer purchase history |
| Suppliers (supplier) | Purchases (filtered) | Supplier invoice history |

---

## 9. Action Architecture Blueprint

### 9.1 Action Categories

**Primary Actions**
The single most important operation on the current screen. Always visible. Never hidden. Never disabled without explanation.

Examples: Add Product, New Purchase Order, Complete Sale, Save Draft, Approve.

**Secondary Actions**
Supporting operations relevant to the workflow. Visible in the action toolbar or via direct row action icons.

Examples: Export, Print, Filter, Edit (row), Pay (row), Reprint.

**Dangerous Actions**
Irreversible or financially significant operations. Must require deliberate confirmation. Visually distinct. Separated from primary actions.

Examples: Cancel Purchase Order, Deactivate User, Delete Inactive Customers, Process Return.

**Rare Actions**
Correct business actions that occur infrequently. May live in an overflow menu or collapsed advanced section.

Examples: Restore Backup, Force Logout, Role Permission Reset.

**Context Actions**
Available only when a specific record is selected and dependent on that record's current state.

Examples: Approve (only for PENDING POs), Receive GRN (only for APPROVED/SENT POs), Reprint (only for completed sales).

**Bulk Actions**
Apply to multiple selected records. Appear only when records are selected.

Note: Bulk actions are not yet implemented. Select-all checkboxes that exist with no corresponding bulk backend operations must be removed until bulk operations are built.

**Overflow Actions**
Rarely needed operations in a contextual "More" menu.

### 9.2 Action Placement Rules

| Action Type | Placement |
| --- | --- |
| Primary | Module header — always visible |
| Secondary | Toolbar — visible, lower visual weight |
| Context | Detail panel action area — conditional on selection |
| Dangerous | Dedicated zone — separated, requires confirmation |
| Rare | Overflow menu (kebab / "More") |
| Bulk | Bulk action bar — appears only when records are selected |

### 9.3 Disabled vs. Hidden Standard

**Hide** when:
- The feature is not yet implemented (backend not built)
- The feature is not licensed for this installation
- The feature is irrelevant to the current workflow context
- A Phase 2 placeholder exists that could mislead the operator

**Disable** when:
- The feature is implemented and relevant but unavailable due to the current record state, permission, or configuration
- The operator needs to see the action to understand what is possible next in the workflow

**Disabled controls must always communicate the reason:**
- Tooltip on hover explaining the constraint
- Locked label alongside the button
- Inline status note when the action is prominent
- Permission notice in the detail panel

**Prohibited:** Labels like "Print Disabled", "Export Unavailable", "Payment Disabled" as the primary button text. These must be replaced with proper disabled state communication.

### 9.4 Confirmation Dialog Standard

Dangerous actions must require confirmation that:
- Identifies what will happen
- States the scope (which record, which count)
- Warns of consequence if irreversible
- Provides clearly labelled Cancel and Confirm buttons
- Never auto-executes after a timer

---

## 10. Progressive Disclosure Blueprint

### 10.1 Disclosure Levels

**Always Visible**
Immediately accessible without any interaction. Never collapsed or behind a tab.

Examples: Cart total in Billing, PO status in PO list, Customer balance in Customers list, Today's sales in Dashboard.

**Collapsible**
Useful but not required for every interaction. Default state is collapsed.

Examples: Notes in PO form, Ledger history in Supplier detail, Charts in Dashboard.

**Advanced Section**
Fields and options for minority cases. Grouped under an expandable section.

Examples: Product advanced policies, PO shipping and payment terms, Customer credit limit configuration.

**Hidden Until Needed**
Appears only when a triggering condition is met (license activated, permission granted, workflow state reached).

Examples: Split payment (Mixed method selected), Expiry selection (product has expiry enabled), Approval gate (PO is PENDING_APPROVAL).

**Role-Hidden**
Fully functional but not visible to the current role. No disabled placeholder — it simply does not appear.

Examples: Stock adjustment (not for Cashier), Approve PO (not for Warehouse).

**License-Hidden**
Requires a specific product edition or license. Not visible without entitlement.

Examples: Multi-warehouse, Advanced tax, Promotions, CRM, HR/Payroll.

**Workflow-Locked**
Action exists and is permitted, but cannot be taken until the record reaches the required state.

Examples: Send to Supplier (only after APPROVED), Receive GRN (only after SENT or SUPPLIER_CONFIRMED).

**Governance-Locked**
Actions requiring explicit governance gate resolution before UI activation.

Examples: Process Return (Document 43 gate), Reports Load (installer parity gate), Restore activation.

### 10.2 Progressive Disclosure Rules

1. The default experience must remain simple.
2. When a feature is hidden, it must be entirely absent — no disabled placeholder.
3. When a feature is disabled due to workflow state, it must be visible and communicate the reason.
4. Advanced sections must be collapsed by default but discoverable.
5. Phase 2 / future capabilities with no backend implementation must be **hidden**, not disabled.

---

## 11. Component Blueprint

### 11.1 Component Adoption Rule

The EposUI primitive library exists at `src/renderer/components/ui-primitives.js`. It currently has zero adoption across all renderers. This Blueprint does not mandate immediate forced adoption. Adoption follows a controlled rollout:

1. New renderers and new screens must use approved components.
2. Existing renderers adopt components module-by-module during the UI refinement phase.
3. The Purchase Orders renderer is the first candidate for adoption demonstration.
4. No module may define a new module-specific component if a system component satisfies the need.

### 11.2 Mandatory Component Families

#### Action Components

| Component | Notes |
| --- | --- |
| Button | Primary, secondary, danger, neutral variants. Partially exists (epos-btn-*) — not globally adopted. |
| Icon Button | Accessible label required. Not standardised. |
| Split Action | Primary action + overflow arrow. Not yet implemented. |
| Action Group | Related buttons grouped. Not yet implemented. |
| Keyboard Shortcut Hint | kbd element. Exists in Billing sidebar only. |

#### Form Components

Input, Select, Checkbox, Toggle, Textarea, Date Field, Number Field, Form Field, Form Section, Validation Message.

#### Search and Filter Components

Search Box (debounced with clear), Quick Filter (status chips), Date Filter (range + quick shortcuts), Filter Builder (advanced — future).

#### Data Components

Data Table, Data Row, Column Header, Pagination, Summary Row, Details Panel, Bulk Action Bar.

#### Display Components

Card, Stats Card / KPI Card, Summary Card, Badge, Status Indicator, Empty State, Loading State, Error State, Timeline.

#### Feedback Components

Toast, Inline Message, Confirmation Message, Validation Error, System Notice.

#### Navigation Components

Sidebar Item, Workspace Switcher, Breadcrumb, Tabs, Toolbar, Context Header.

#### Overlay Components

Modal / Dialog, Drawer, Confirmation Dialog, Popover, Context Menu, Stepper / Wizard.

#### Output Components

Receipt Section, Report Section, Print Header, PDF Summary, Print Preview.

### 11.3 Component State Requirements

Every interactive component must define behaviour for:

```
Default | Hover | Focus | Active | Selected | Disabled | Loading | Error | Warning | Success | Readonly
```

State must not be communicated by colour alone. Every state must have a secondary non-colour indicator.

---

## 12. Design Token Blueprint

### 12.1 Token Authority

Design tokens defined in Doc 23 govern the visual identity system. Exact values and CSS implementation are downstream decisions.

### 12.2 Token Categories

**Colour Tokens**

| Category | Purpose |
| --- | --- |
| color.brand.* | Product identity colours |
| color.surface.* | Background and container colours |
| color.text.* | Text hierarchy colours |
| color.border.* | Divider and border colours |
| color.action.* | Button and interactive element colours |
| color.status.* | Success, warning, danger, info, neutral |
| color.workspace.* | Per-workspace accent colours |
| color.stock.* | Low stock, out of stock indicators |
| color.payment.* | Paid, due, overdue indicators |

**Typography Tokens**

type.family.*, type.size.*, type.weight.*, type.lineHeight.*, type.label.*, type.data.*

Font family: Inter. Body text: text-sm (13-14px). Typography base is correct. Weight hierarchy and heading semantics require standardisation.

**Spacing Tokens**

Spacing must support two density modes. No module may invent its own spacing rhythm.

| Mode | Context |
| --- | --- |
| Calm spacing | Forms, settings, dialogs, payment confirmation |
| Productive density | Tables, inventory, purchases, purchase orders, reports |

Categories: space.inline.*, space.stack.*, space.inset.*, space.layout.*, space.form.*, space.table.*, space.dialog.*

**Elevation / Shadow Tokens**

| Token | Usage |
| --- | --- |
| shadow.elevation.flat | Cards at rest |
| shadow.elevation.raised | Active cards, focused panels |
| shadow.elevation.popover | Dropdowns, popovers |
| shadow.elevation.modal | Modals and dialogs |

**Density Tokens**

| Token | Usage |
| --- | --- |
| density.table.compact | Data-heavy list modules |
| density.table.standard | Standard list modules |
| density.form.comfortable | Settings and forms |
| density.cashier | Billing workspace |

**Theme Readiness**

Token system must support Light Theme (current), Dark Theme (planned), and High Contrast Theme (future). Token names must remain stable as values change between themes.

### 12.3 Current Token Gaps

| Gap | Note |
| --- | --- |
| Two parallel systems | --app-* tokens coexist with Tailwind variables. Must be unified. |
| Module-local tokens | Some modules define private --epos-[module]-* tokens. Must be absorbed into global hierarchy. |
| Sidebar third namespace | --epos-sidebar-* is a third token namespace. Must merge. |
| No dark mode layer | No data-theme="dark" token layer exists. |

CSS implementation strategy is downstream and not governed by this Blueprint.

---

## 13. Layout Blueprint

### 13.1 App Shell

The Desktop App Shell is the persistent product frame. It must:

- Provide stable workspace navigation via persistent left sidebar
- Show current user, role, and session status
- Show module title in the context header
- Contain the global toast notification area (fixed position, top-right)
- Not host module-level forms or feature content
- Not become a flat list of every feature as the product grows

### 13.2 Sidebar

- Organised into workspace families with group headings
- Each navigation item has an SVG icon, a label, and clear active/inactive state
- Locked items show a lock indicator alongside the label
- Brand name and logo configurable, not hardcoded
- Width accommodates workspace labels without truncation at 1366x768

### 13.3 Context Header

- Shows current module title (implemented via routeTitle)
- Shows current user name and role (partially implemented)
- Shows sync status indicator (currently inert)

### 13.4 Workspace Content Area

- Scrollable within the workspace, not the shell
- Consistent max-width for content-heavy modules
- No max-width restriction for data-heavy modules
- Primary action always at the top

### 13.5 Cards

- Standard surface container using shadow.elevation.flat token
- Consistent padding from space.inset.card token
- Hover state for interactive cards
- No module-specific card variants

### 13.6 Data Tables

- Column headers stable and sortable
- Empty state distinct from loading state
- Filtered-empty state distinct from true empty state
- Loading state uses skeleton rows, not an empty table
- Row hover and selection states visible
- Actions column always last, never wraps

### 13.7 Forms

- Related fields grouped in a Form Section
- Required fields clearly marked
- Validation messages near the field, not at form top
- Advanced fields in a collapsed section
- Save and Cancel always visible
- Long forms use progressive disclosure, not excessive vertical scroll

### 13.8 Split Panels

- List panel left, detail panel right
- Detail panel opens on row selection without page transition
- Detail panel has its own scroll area
- Detail panel does not overlap the list on minimum supported viewport

### 13.9 Notification Placement

| Message Type | Placement |
| --- | --- |
| Transient success | Global toast (top-right, auto-dismiss) |
| Transient error | Global toast (top-right, requires dismissal) |
| Persistent contextual | Inline message area within module (below toolbar, above table) |
| Field validation | Inline below the specific field |
| Dangerous action warning | Blocking confirmation dialog before execution |
| Background processing | Stable status area in header — does not interrupt workflow |

### 13.10 Responsive Desktop Rules

| Rule | Statement |
| --- | --- |
| Minimum viewport | 1366x768 — all workflows must be complete at this size |
| Large monitor | Layout expands gracefully, additional context visible |
| Window resize | No toolbar overlap, no hidden critical buttons |
| Horizontal scroll | Permitted only for tables with genuinely wide data columns |

---

## 14. Reports Blueprint

### 14.1 Corrected Direction

**The current Reports implementation violates the approved blueprint.**

The current implementation loads all 13 report categories simultaneously. This violates Doc 20 section 6 and creates excessive cognitive load. This section defines the correct direction.

### 14.2 Required Reports Screen Structure

```
MODULE HEADER
Reports

REPORT FAMILY SELECTOR
Sales Reports | Inventory Reports | Purchase Reports
Customer Reports | Expense Reports | Supplier Reports

FILTERS (context-specific to selected family)
Date range (required)
Secondary filters (cashier, product, supplier, customer — as applicable)

SUMMARY METRICS
3-5 key numbers for the selected report family

RESULT AREA
Data table  |  Chart (where supported)

DRILL-DOWN AREA
Source record details on row click

EXPORT / PRINT CONTROLS
Only for report types that support them
```

### 14.3 Report Family Definitions

| Family | Reports Included |
| --- | --- |
| Sales Reports | Sales summary, Cashier reconciliation, Credit sales, Returns, Refunds |
| Inventory Reports | Low stock, Stock value, Stock movements (future) |
| Purchase Reports | Purchase history, GRN report, Purchase order summary |
| Customer Reports | Customer due, Customer ledger summary |
| Supplier Reports | Supplier balances, Supplier payments |
| Expense Reports | Expense by category |

### 14.4 Load Behaviour

- No data loads until the operator selects a report family and applies date filters
- Results replace the previous report — they do not accumulate
- Loading shows skeleton state while query runs
- The Reports Load gate (installer parity decision) must be resolved before this screen is activated

---

## 15. Dashboard Blueprint

### 15.1 Role-Aware Dashboards

There is no single universal dashboard. Each role lands on a dashboard appropriate to their primary workflow.

### 15.2 Cashier

Not applicable. Cashier lands directly in Billing.

### 15.3 Store Manager Dashboard

| Section | Content |
| --- | --- |
| Critical Alert Strip | Low stock count, overdue dues, pending PO count, open returns |
| Today Summary | Sales total, payment breakdown, invoice count, profit indicator |
| Operations Snapshot | Stock risk, today's purchases, returns count, expenses |
| Manager Quick Links | Inventory, Purchases, Customers, Reports |
| Recent Activity | Latest sales, returns, stock adjustments |
| Insights | Daily sales trend chart, top products |

### 15.4 Owner Dashboard (Command Center)

| Section | Content |
| --- | --- |
| Business Health | Revenue trend, gross profit indicator, cash position |
| Risk Signals | Overdue receivables, overdue payables, low stock value |
| Top Performance | Top products, top customers |
| Cost Summary | Expense by category, purchase cost |
| Suspicious Activity | Unusual discounts, high-value returns, void activity |

### 15.5 Accountant Dashboard

| Section | Content |
| --- | --- |
| Financial Position | Total receivables, total payables, cash balance |
| Overdue Alerts | Customer credit overdue, supplier payment overdue |
| Expense Summary | Month-to-date by category |
| Quick Links | Reports, Supplier Ledger, Customer Ledger |

### 15.6 Purchasing / Warehouse Dashboard

| Section | Content |
| --- | --- |
| PO Summary | Draft, pending approval, approved, in transit |
| Stock Alerts | Low stock items, out of stock count |
| GRN Pending | Purchase orders awaiting receiving |
| Supplier Status | Outstanding payables by supplier |

### 15.7 KPI Priority Rules

| Level | Display Rule |
| --- | --- |
| Critical | Always visible — alert strip at top |
| Operational | Primary KPI card row — always visible |
| Contextual | Secondary card row — collapsible on smaller viewports |
| Analytical | Chart area — collapsible, role-appropriate |
| Deep Analysis | Not on dashboard — belongs in Reports |

---

## 16. Module Blueprint Summary

### Dashboard

| Property | Definition |
| --- | --- |
| Pattern | Dashboard / KPI Screen |
| Primary purpose | Operational situation awareness |
| Primary actions | Refresh, Go to Billing, View low stock, View pending POs, View dues |
| Secondary actions | Export (future), Drill-down links |
| Information hierarchy | Critical alerts → today performance → operations → activity → insights |
| Replaceability | READY |
| Misalignment | Lucky Draw KPI card present despite module being on HOLD |

---

### Billing

| Property | Definition |
| --- | --- |
| Pattern | POS Workspace |
| Primary purpose | Fastest possible sale completion |
| Primary actions | Scan/search, Add to cart, Pay Now |
| Secondary actions | Customer assignment, Discount, Print, Reprint, Cart switch |
| Information hierarchy | Search -> Cart -> Total -> Payment -> Customer -> Receipt |
| Replaceability | PARTIAL — CSS split across two files |
| Misalignment | Wholesale mode, Hold Sale, WhatsApp permanently disabled but visible; Split Payment shows Phase 2 kbd label |

---

### Sales History / Completed Invoices

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Invoice lookup, review, and reprint |
| Primary actions | Search invoice, Reprint |
| Secondary actions | Filter by date, status, payment method |
| Information hierarchy | Filter bar -> Invoice list -> Invoice detail -> Line items |
| Replaceability | READY |
| Misalignment | Shares sidebar icon with Purchase Orders; no link to Customer from invoice |

---

### Products

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Product master data management |
| Primary actions | Add Product, Edit, Activate/Deactivate, Search |
| Secondary actions | Import/Export (future), Barcode tools |
| Information hierarchy | Search -> Filter tabs -> Product list -> Product detail -> Advanced policies |
| Replaceability | NOT READY — product form in global shell |
| Misalignment | **Product form must be moved to products/index.html before UI ratification.** Import/Export buttons hidden in DOM. |

---

### Inventory

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Stock truth and safe adjustment |
| Primary actions | Adjust Stock, Search, Filter by status |
| Secondary actions | View movement history, Barcode print (future), Transfer (future) |
| Information hierarchy | Stock alerts -> Product list -> Stock qty/value -> Adjustment panel |
| Replaceability | READY |
| Misalignment | 5 disabled toolbar buttons visible; no approval gate for stock adjustment; no adjustment reason code |

---

### Purchases

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Supplier purchase ledger and payment recording |
| Primary actions | New Purchase, Record Payment, View details |
| Secondary actions | Filter by status/date/supplier, Print/Export (future) |
| Information hierarchy | Filter bar -> Purchase list -> Purchase detail -> Line items -> Payment history |
| Replaceability | READY |
| Misalignment | **Payment button disabled despite backend being complete** — highest-priority unlock needed; 7 date shortcut buttons all disabled |

---

### Purchase Orders

| Property | Definition |
| --- | --- |
| Pattern | Document Screen |
| Primary purpose | Procurement planning, approval, and lifecycle management |
| Primary actions | New PO, Save Draft, Approve, Cancel |
| Secondary actions | Send to Supplier, Receive GRN (future), Create Invoice (future) |
| Information hierarchy | PO status -> Supplier -> Expected items -> Dates -> Totals -> Notes |
| Replaceability | READY (reference implementation) |
| Misalignment | 20+ Phase 2 form fields scattered throughout form; 7 disabled aside quick-action buttons; Phase 2 Attachments tab visible |

---

### Suppliers

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Supplier relationship and payable management |
| Primary actions | Add Supplier, Edit, Record Payment, View Ledger |
| Secondary actions | Statement, Aging analysis, WhatsApp |
| Information hierarchy | Supplier list -> Contact/totals -> Purchase history -> Payment ledger |
| Replaceability | READY |
| Misalignment | Statements/Aging/Export blocked by certification gate — decision required; "Unavailable" label text on disabled buttons |

---

### Customers

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Customer identity, credit, and sales relationship management |
| Primary actions | Add Customer, Edit, Record Payment, View Ledger |
| Secondary actions | WhatsApp, Groups (future), Import/Export (future) |
| Information hierarchy | Customer list -> Balance/credit -> Ledger -> Recent sales -> Contact |
| Replaceability | PARTIAL — four duplicate element IDs |
| Misalignment | **Four duplicate IDs** (customerWhatsAppButton, customerDeleteInactiveButton, customerLedgerShortcut, openCustomerGroupsButton) — DOM defect; Select All checkbox with no bulk backend |

---

### Returns

| Property | Definition |
| --- | --- |
| Pattern | Wizard / Stepper Screen |
| Primary purpose | Invoice lookup and return processing |
| Primary actions | Look up invoice, Process Return |
| Secondary actions | Filter returns history |
| Information hierarchy | Invoice lookup -> Return items selection -> Confirmation -> Result |
| Replaceability | READY |
| Misalignment | **Process Return disabled (Document 43 gate) — decision required**; Exchange disabled with no backend; "Disabled" appears as primary button text |

---

### Reports

| Property | Definition |
| --- | --- |
| Pattern | Report Workspace |
| Primary purpose | Business truth, decision support, financial reconciliation |
| Primary actions | Select report family, Apply filters, Run report |
| Secondary actions | Drill-down, Export (future), Print |
| Information hierarchy | Report selector -> Filters -> Summary metrics -> Table/chart -> Drill-down |
| Replaceability | READY |
| Misalignment | **Current implementation violates the approved pattern** — all 13 reports load simultaneously; Load button disabled by installer parity gate — decision required |

---

### User Management

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Safe access control management |
| Primary actions | Add User, Edit, Deactivate/Reactivate, Reset Password |
| Secondary actions | Role editor, Permission editor, Activity Log |
| Information hierarchy | User list -> Role/status -> Security state -> Permissions -> Activity |
| Replaceability | READY |
| Misalignment | Role Permission Map tab disabled; Import/Export disabled; Online Now / Locked filters static; Force Logout disabled |

---

### Settings

| Property | Definition |
| --- | --- |
| Pattern | Configuration Screen |
| Primary purpose | Safe store and system configuration |
| Primary actions | Save Settings, Test Printer, Backup |
| Secondary actions | Restore (governance-gated), Updates (future), License (future) |
| Information hierarchy | Category navigation -> Settings group -> Field values -> Save/test -> Dangerous actions |
| Replaceability | PARTIAL — renderer is 95.4 KB monolith; no CSS file |
| Misalignment | Business Config fields all disabled; Updates tab and License tab have no backend — must be hidden |

---

### Sync Queue

| Property | Definition |
| --- | --- |
| Pattern | Status Board |
| Primary purpose | Sync status visibility |
| Primary actions | View status, Retry sync (when enabled) |
| Secondary actions | View sync log |
| Information hierarchy | Enabled/disabled -> Connection -> Last sync -> Pending changes -> Errors |
| Replaceability | READY |
| Misalignment | All action buttons disabled; sidebar visibility should be conditioned on sync activation |

---

### Expenses

| Property | Definition |
| --- | --- |
| Pattern | Master-Detail Screen |
| Primary purpose | Business expense recording and categorisation |
| Primary actions | Add Expense, Edit, Void |
| Secondary actions | Category management, Filter, Export (future) |
| Information hierarchy | Expense list -> Amount/category/date -> Payment method -> Category totals |
| Replaceability | READY |
| Misalignment | Hidden from sidebar (installer parity decision pending) |

---

### Lucky Draw

| Property | Definition |
| --- | --- |
| Pattern | Document Screen (campaign-centric) |
| Primary purpose | Customer engagement campaign management |
| Primary actions | Create campaign, View entries, Draw winner, Verify coupon |
| Secondary actions | Campaign history, Participant tools |
| Information hierarchy | Active campaign -> Eligibility -> Entries -> Winners -> Verification |
| Replaceability | HOLD — not to be modified |
| Misalignment | Module is on HOLD — all UI work frozen |

---

## 17. Current Implementation Misalignment Register

Resolution of these items is NOT authorised by this document. Each item requires a separate implementation milestone.

| ID | Module | Misalignment | Severity | Blueprint Rule |
| --- | --- | --- | --- | --- |
| M-01 | Products | Product form modal embedded in global renderer/index.html | CRITICAL | Section 4 R3, R4 |
| M-02 | Reports | All 13 reports load simultaneously — no family selector | CRITICAL | Section 14 |
| M-03 | All | Sidebar is a flat module list — no workspace family grouping | HIGH | Section 5 |
| M-04 | Navigation | Emoji unicode icons; PO and Sales History share identical icon | HIGH | Section 5.3 |
| M-05 | Navigation | Brand name hardcoded in sidebar | HIGH | Section 5.3 |
| M-06 | All | 9 modules with separate local message areas — global toast unused | HIGH | Section 13.9 |
| M-07 | All | EposUI component library has zero adoption across 14 renderers | HIGH | Section 11 |
| M-08 | Multiple | Disabled buttons with "Disabled" / "Unavailable" as primary label text | HIGH | Section 9.3 |
| M-09 | Multiple | Select All checkboxes exist with no bulk action backend | MEDIUM | Section 9.1 |
| M-10 | Customers | Four duplicate element IDs — DOM defect | MEDIUM | Section 4 |
| M-11 | Settings | Renderer is 95.4 KB monolith | MEDIUM | Section 4 |
| M-12 | Design System | Two parallel CSS token systems with no unified hierarchy | MEDIUM | Section 12 |
| M-13 | Billing | CSS split across compact.css and billing.css | MEDIUM | Section 4 R5 |
| M-14 | Purchases | Payment button disabled despite backend being complete | HIGH | Section 9.1 |
| M-15 | Returns | Process Return disabled — Document 43 gate decision required | HIGH | Section 10 Governance-Locked |
| M-16 | Reports | Load button disabled — installer parity gate decision required | HIGH | Section 10 Governance-Locked |
| M-17 | Permission model | Accountant absent from READ_ROLES in Expenses, Suppliers, Reports | HIGH | Section 6 |
| M-18 | All | No loading state — tables show empty immediately during data fetch | MEDIUM | Section 11.2 |
| M-19 | Inputs | outline: none suppresses visible focus on inputs — accessibility defect | HIGH | Section 11.3 |
| M-20 | 6 modules | No dedicated CSS file — inconsistent with CSS-heavy modules | LOW | Section 4 R5 |

---

## 18. Future ERP Expansion Rules

### 18.1 ERP Expansion Principle

ERP depth must attach to existing workspace families. It must not invade the core POS cashier workflow. All ERP features are hidden by default.

### 18.2 Expansion Stage Summary

| Stage | UI Architecture Impact | Risk |
| --- | --- | --- |
| ERP Lite (Expenses + basic accounting) | Activate Expenses sidebar item, add Accounting to Money workspace | LOW |
| Multi-Branch | Branch indicator in context header, branch filters in Inventory/Sales/PO | MEDIUM |
| Multi-Warehouse | Warehouse selector in Inventory, from/to warehouse in stock movements | MEDIUM |
| Cloud ERP | Shell replacement milestone; .api.js shim is migration path | MEDIUM-HIGH |
| Finance / Accounting | New Accounting module in Money; Reports gains Financial family | MEDIUM |
| CRM | Customers workspace expands; Kanban pattern needed (new pattern approval required) | HIGH |
| Manufacturing | Products gains BOM tab; new Production module; new Document Screen variants | HIGH |
| HR / Payroll | New People workspace; Calendar/Attendance screen patterns | VERY HIGH |

### 18.3 ERP Expansion Rules

| Rule | Statement |
| --- | --- |
| EX-1 | Every ERP addition attaches to the correct workspace family or creates a formally approved new one. |
| EX-2 | No ERP addition may modify the Billing workspace or increase friction in the cashier path. |
| EX-3 | All ERP additions are hidden by default. They appear only when licensed, enabled, and permission-allowed. |
| EX-4 | The .api.js IPC shim layer must remain the stable contract boundary for all future edition migrations. |
| EX-5 | No ERP addition may introduce a new layout pattern without formal Blueprint amendment. |
| EX-6 | The seven workspace families must accommodate new ERP domains without restructuring existing families. |

---

## 19. Implementation Control Rules

### 19.1 New UI Work Requirements

Every future UI implementation task must:

1. Reference this Blueprint by document ID in its implementation brief.
2. Classify every visible action in scope as: keep, reorder, rename, merge, simplify, remove, hide, defer, or pending business decision.
3. State which screen pattern it follows.
4. Confirm no business logic will be added to the renderer.
5. Confirm the renderer follows the IIFE + AbortController pattern.
6. Confirm all changed elements follow the Disabled vs. Hidden standard (Section 9.3).

### 19.2 Module UI Change Requirements

Module UI changes may only proceed if:
- They do not contradict this Blueprint
- The screen pattern for the module is confirmed
- The misalignment register items for that module are acknowledged
- The action classification is documented before implementation begins

### 19.3 Renderer Architecture Controls

| Control | Rule |
| --- | --- |
| No business logic in renderer | Verified before implementation approval |
| No module form in global shell | Verified before implementation approval |
| IIFE + AbortController | Required for all new and refactored renderers |
| API-only IPC calls | Renderer calls .api.js — never ipcRenderer directly |
| EposUI adoption | Required for new screens; phased adoption for existing screens |

### 19.4 Backend Workflow Control

A UI placeholder — a disabled button for a backend operation — is **not authorisation to implement the backend operation**. Backend workflow activation requires its own milestone definition and approval.

A Blueprint change is not a backend implementation prompt.

### 19.5 Governance Gates

| Gate | Status |
| --- | --- |
| Process Return activation | Governance-locked — Document 43 certification required |
| Reports Load activation | Governance-locked — Installer parity decision required |
| Restore Activation | Governance-locked — Restore Activation Governance Pack (separate freeze) |
| Business Config fields in Settings | Governance-locked — Settings certification milestone required |

---

## 20. Final Decision

### The Direction

```
REFINE + TARGETED PARTIAL REPLACE + REPLACEABLE UI FOREVER
```

### Rationale

The current UI must be **refined**, not fully rebuilt. The architectural foundation is correct:

- data-fragment HTML fragment architecture — correct
- IIFE renderer module pattern — correct
- FeatureGate system (SAFE / GUARDED / LOCKED) — production-grade
- --app-* design token foundation — correct direction
- Purchase Orders renderer architecture — reference implementation quality

A full rebuild would discard governance work correctly embedded in the existing structure and create unacceptable risk for the production baseline.

### Three Targeted Partial Replacements Required

| Surface | Reason |
| --- | --- |
| **Product form** | Must be extracted from the global shell into products/index.html. Only true architectural defect blocking replaceable UI compliance. |
| **Reports module** | Current layout violates the approved Report Workspace pattern. Must be rebuilt as a report-family-selector-driven screen once the Load gate is resolved. |
| **Settings renderer** | At 95.4 KB, this is a maintenance risk. Must be split into section-based sub-renderers during a settings certification milestone. |

### Replaceable UI Forever

Every future module implementation, refactor, or replacement must comply with the Replaceable UI Doctrine (Section 4). The .api.js IPC shim is the stability boundary for future edition migrations. This commitment is non-negotiable.

### Document Authority

This document has **final UI design authority** for all future UI work on Enterprise POS and its ERP expansion editions.

If any future task, implementation prompt, or module specification conflicts with this Blueprint, work must stop and the conflict must be formally reported and resolved before proceeding.

---

*Enterprise ERP Master UI Blueprint v1.0*
*Status: Final — Pending Formal Approval*
*Branch: upgrade/foundation-v1*

# Module Wireframes

## Document Metadata

| Field         | Value                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document      | Module Wireframes                                                                                                                                                                                                               |
| Version       | Draft v1                                                                                                                                                                                                                        |
| Status        | Draft for Review                                                                                                                                                                                                                |
| Scope         | Governance-level screen structures, information architecture, and desktop workflow organization                                                                                                                                 |
| Applies To    | Desktop POS; Future Web Edition; Future Cloud Edition; Future ERP Editions                                                                                                                                                      |
| Depends On    | 20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md; 21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md; 22_PRODUCT_DESIGN_CONSTITUTION.md; 23_DESIGN_TOKENS.md; 24_COMPONENT_LIBRARY_SPECIFICATION.md; 25_LAYOUT_PATTERNS.md |
| Next Document | 27_UI_PROTOTYPE.md                                                                                                                                                                                                              |

## 1. Purpose

This document defines governance-level module wireframe standards for Enterprise POS.

It describes information architecture, screen structure, workspace organization, user flow,
productivity layout, and keyboard-first desktop workflow.

This document does not define colors, design tokens, components, CSS, pixel sizes, visual styling,
implementation, or backend behavior.

## 2. Scope

This document governs screen structure for major workspaces and modules.

It applies to:

- Desktop POS modules
- Future Web Edition
- Future Cloud Edition
- Future ERP Editions
- Future plugin modules

It does not replace Layout Patterns, Component Library Specification, Design Tokens, Product
Language, or the Enterprise Product Experience Blueprint.

## Wireframe Authority

Document hierarchy:

- Product Constitution is higher authority.
- Product Design Constitution governs design philosophy.
- Design Tokens govern visual variables.
- Component Library governs reusable UI components.
- Layout Patterns govern page and workspace structure.
- Module Wireframes govern module screen structures and interaction layouts.
- UI Prototype defines approved visual composition.
- Implementation translates approved designs into production UI.

This document must not override architecture, terminology, design tokens, component definitions, or
layout governance.

## 3. Wireframe Principles

Enterprise POS wireframes must:

- Preserve commercial POS speed.
- Keep Billing cashier-first.
- Use role-aware workspace organization.
- Keep advanced complexity progressively disclosed.
- Support keyboard-first desktop workflows.
- Keep search, filters, details, and actions predictable.
- Avoid unnecessary dialogs.
- Avoid repeated data entry.
- Preserve official terminology.
- Support future ERP expansion without disrupting simple stores.

Wireframes must describe structure and flow only. Visual design belongs to later approved documents.

## 4. Enterprise Desktop Shell Reference

All module wireframes live inside the Enterprise POS Desktop App Shell.

The shell provides:

- Workspace orientation.
- Role-aware navigation.
- Module context.
- System and user status.
- Future Platform and Sync awareness.
- Consistent access to approved workspaces.

Modules must not redefine the app shell. They may define only their own internal screen structure.

## 5. Standard Screen Anatomy

Standard module screen order:

1. Workspace Header
2. Context Toolbar
3. Search Area
4. Filter Area
5. KPI / Statistics
6. Primary Workspace
7. Data Grid
8. Details / Inspector Panel
9. Action Bar
10. Status Area

Not every module needs every region. Regions may be omitted when they do not serve the workflow.

Regions must remain predictable:

- Workspace Header identifies where the user is.
- Context Toolbar contains workflow-level actions.
- Search Area supports fast record discovery.
- Filter Area narrows data.
- KPI / Statistics show useful operational summaries.
- Primary Workspace contains the main task.
- Data Grid presents structured records.
- Details / Inspector Panel provides secondary context.
- Action Bar holds workflow actions.
- Status Area shows compact feedback, permissions, and background activity.

## Required vs Optional Screen Regions

Mandatory regions for most modules:

- Workspace Header.
- Primary Workspace.
- Status Area.

Workflow-dependent regions:

- Context Toolbar.
- Search Area.
- Filter Area.
- KPI / Statistics.
- Data Grid.
- Details / Inspector Panel.
- Action Bar.
- Details Panel.

Rules:

- Search is required when record discovery is a primary workflow.
- Filters are required when lists can become operationally large.
- KPI / Statistics appear only when they improve decisions.
- Data Grid is required for list-heavy modules.
- Inspector or Details Panel appears when secondary context improves productivity.
- Action Bar appears when workflow actions must remain grouped and predictable.
- Status Area must remain compact and non-disruptive.

## 6. Module Wireframes

## Workspace-to-Module Map

Official workspace mapping:

- Sell
  - Billing
  - Returns
  - Completed Invoices
  - Reprint-related workflows

- Stock
  - Products
  - Categories
  - Brands
  - Units
  - Inventory
  - Stock Adjustments
  - Stock Transfers
  - Purchases
  - Purchase Orders
  - Suppliers

- Customers
  - Customers
  - Customer credit context
  - Customer ledger context

- Money
  - Expenses
  - Reports
  - Analytics
  - Future Accounting capabilities
  - Future Finance capabilities

- Growth
  - Lucky Draw
  - Future promotions
  - Future loyalty
  - Future AI-assisted growth capabilities

- Control
  - Users
  - Roles & Permissions
  - Activity Logs
  - Notifications
  - Settings
  - Backup & Restore

- Platform
  - License
  - Platform
  - Future devices
  - Future diagnostics
  - Future support mode

No new workspace names may be introduced without formal approval.

### Dashboard

Purpose: Role-aware business health and decision center.

Structure:

- Workspace Header identifies the role-aware dashboard.
- KPI / Statistics appear before deep details.
- Alerts and operational risks appear early.
- Primary Workspace shows business health summaries.
- Reports and drill-down actions remain secondary.
- Status Area shows refresh and data freshness.

Always visible:

- Critical operational signals.
- Today's business summary.
- Navigation to priority work.

Hidden until needed:

- Advanced analytics.
- Forecasting.
- Branch comparisons.

### Billing (POS)

Purpose: Fast Cashier Console for live sale completion.

Structure:

- Workspace Header remains minimal.
- Search Area is the primary entry point.
- Primary Workspace contains the cart and sale flow.
- Customer context appears near payment context.
- Action Bar prioritizes payment and sale completion.
- Status Area shows compact sale feedback.

Always visible:

- Search/scanner input.
- Cart.
- Total.
- Payment method.
- Pay Now.
- Current customer/payment state.

Hidden until needed:

- Split payment.
- Refund/exchange.
- Batch/expiry selection.
- Price override reasoning.
- Advanced tax.

### Products

Purpose: Product master data management.

Structure:

- Workspace Header provides Add Product.
- Search Area and Filter Area precede the Data Grid.
- KPI / Statistics may summarize product count and stock risk.
- Data Grid shows product records.
- Details / Inspector Panel or focused form shows product detail.
- Advanced policies stay collapsed until needed.

Always visible:

- Search.
- Product list.
- Primary add/edit actions.

Hidden until needed:

- Variants.
- Multi-unit.
- Price lists.
- Tax rules.
- Advanced product policies.

### Categories

Purpose: Organize product groups.

Structure:

- Workspace Header identifies product classification.
- Search Area helps locate categories.
- Data Grid lists categories.
- Details / Inspector Panel shows category metadata.
- Action Bar supports add, edit, activate, or deactivate where allowed.

Always visible:

- Category list.
- Add Category where permitted.

Hidden until needed:

- Advanced reporting group rules.
- Future hierarchy depth.

### Brands

Purpose: Manage product brand identity.

Structure:

- Workspace Header identifies Brands.
- Search Area supports brand lookup.
- Data Grid lists brands.
- Details / Inspector Panel shows brand metadata and product usage context where available.

Always visible:

- Brand list.
- Add Brand where permitted.

Hidden until needed:

- Brand analytics.
- Brand supplier relationships.

### Units

Purpose: Manage display units and future unit governance.

Structure:

- Workspace Header identifies Units.
- Data Grid lists units.
- Details / Inspector Panel shows unit details.
- Advanced conversion concepts remain hidden until future Multi-Unit capability is enabled.

Always visible:

- Unit list.
- Add Unit where permitted.

Hidden until needed:

- Conversion rules.
- Base unit/purchase unit/sale unit configuration.

### Customers

Purpose: Customer identity, credit, and ledger context.

Structure:

- Workspace Header provides Add Customer.
- Search Area is prominent.
- Filter Area supports status and credit context.
- KPI / Statistics show customer and due summaries.
- Data Grid lists customers.
- Details / Inspector Panel shows profile, ledger, and recent activity.

Always visible:

- Customer list.
- Search.
- Balance or credit indicators.

Hidden until needed:

- Groups.
- Loyalty.
- Customer-specific pricing.
- Advanced segmentation.

### Suppliers

Purpose: Supplier identity and payable context.

Structure:

- Workspace Header provides Add Supplier.
- Search Area and Filter Area narrow suppliers.
- KPI / Statistics show purchase and due context.
- Data Grid lists suppliers.
- Details / Inspector Panel shows profile, purchases, and payments.

Always visible:

- Supplier list.
- Search.
- Purchase/due summary.
- Direct row actions.

Hidden until needed:

- Statement.
- Aging.
- Contract details.
- Supplier scorecard.

### Purchases

Purpose: Supplier purchase receiving and history.

Structure:

- Workspace Header provides New Purchase.
- Search Area and Filter Area control purchase history.
- KPI / Statistics show totals and payment state.
- Data Grid lists purchase records.
- Primary Workspace may show purchase entry as a focused form or panel.
- Details / Inspector Panel shows purchase items and totals.

Always visible:

- Purchase history.
- New Purchase.
- Search/filter.

Hidden until needed:

- Advanced payment settlement.
- Batch receiving.
- Barcode receiving.
- PO conversion.

### Purchase Orders

Purpose: Plan supplier orders before purchase receiving.

Structure:

- Workspace Header provides New Purchase Order.
- KPI / Statistics show order states.
- Search Area and Filter Area support supplier, status, and date.
- Data Grid lists purchase orders.
- Details / Inspector Panel shows order items and status timeline.

Always visible:

- Purchase Order list.
- Status.
- New Purchase Order.

Hidden until needed:

- Approval workflow.
- Receiving.
- Conversion to purchase.
- Requisitions.

### Inventory

Purpose: Stock truth, stock risk, and movement visibility.

Structure:

- Workspace Header identifies stock health.
- KPI / Statistics show stock value, low stock, and out of stock.
- Search Area and Filter Area support product, category, brand, supplier, and status.
- Data Grid lists stock records.
- Details / Inspector Panel shows movement history.

Always visible:

- Stock list.
- Stock risk indicators.
- Search/filter.

Hidden until needed:

- Batch/FIFO/FEFO.
- Warehouse transfer.
- Serial tracking.

### Stock Adjustments

Purpose: Controlled stock correction workflow.

Structure:

- Workspace Header identifies Adjust Stock.
- Search Area locates product.
- Primary Workspace captures adjustment reason and quantity.
- Details / Inspector Panel shows current stock and recent movement context.
- Action Bar provides safe submit/cancel behavior.

Always visible:

- Selected product.
- Current stock.
- Adjustment quantity.
- Reason.

Hidden until needed:

- Approval workflow.
- Advanced audit attachments.

### Stock Transfers

Purpose: Future stock movement between locations or warehouses.

Structure:

- Workspace Header identifies transfer workflow.
- Search Area locates products.
- Primary Workspace captures source, destination, and items.
- Data Grid lists transfer lines.
- Status Area shows transfer state.

Always visible:

- Source.
- Destination.
- Transfer items.

Hidden until needed:

- Multi-warehouse approval.
- Shipment tracking.
- ERP logistics fields.

### Returns

Purpose: Customer return and refund workflow.

Structure:

- Workspace Header identifies Returns.
- Search Area prioritizes invoice lookup.
- Primary Workspace shows invoice summary and returnable items.
- Data Grid lists return lines.
- Details / Inspector Panel shows prior returns, payment context, and restrictions.
- Action Bar provides process return actions.

Always visible:

- Invoice lookup.
- Returnable quantity.
- Refund amount.
- Reason.

Hidden until needed:

- Exchange workflow.
- Store credit.
- Complex split refund.
- Coupon/winner restrictions detail.

### Expenses

Purpose: Record and monitor business expenses.

Structure:

- Workspace Header provides Add Expense.
- KPI / Statistics show period totals.
- Search Area and Filter Area support date, category, and payment method.
- Data Grid lists expenses.
- Details / Inspector Panel shows expense detail.

Always visible:

- Expense list.
- Add Expense.
- Period total.

Hidden until needed:

- Recurring expenses.
- Attachments.
- Approval workflow.

### Reports

Purpose: Business reports and drill-down analysis.

Structure:

- Workspace Header identifies Reports.
- Context Toolbar provides report family selection.
- Filter Area provides date and report-specific controls.
- KPI / Statistics summarize report output.
- Primary Workspace shows table, chart, or drill-down result.
- Action Bar supports print/export where available.

Always visible:

- Report selector.
- Date/context filters.
- Result summary.

Hidden until needed:

- Advanced filters.
- Saved reports.
- Scheduled reports.
- AI natural language reports.

### Analytics

Purpose: Manager and owner insight beyond operational reports.

Structure:

- Workspace Header identifies Analytics.
- KPI / Statistics appear early.
- Primary Workspace shows trends, comparisons, and insights.
- Data Grid or Details Panel provides drill-down.
- Status Area shows freshness and filter context.

Always visible:

- Key metrics.
- Date context.
- Drill-down path.

Hidden until needed:

- Forecasting.
- Branch comparison.
- AI insights.

### Lucky Draw

Purpose: Growth campaign, entries, coupon verification, and winner workflow.

Structure:

- Workspace Header identifies Lucky Draw.
- KPI / Statistics show active campaign state and entry counts.
- Primary Workspace shows campaigns or active draw state.
- Data Grid lists entries, participants, or winners depending on context.
- Action Bar supports campaign and draw actions.

Always visible:

- Active campaign status.
- Entry/winner state.
- Verification access.

Hidden until needed:

- Advanced campaign rules.
- Loyalty integration.
- AI targeting.

### Users

Purpose: Customer-side user management.

Structure:

- Workspace Header provides Add User.
- Search Area and Filter Area support role/status.
- KPI / Statistics show user states.
- Data Grid lists users.
- Details / Inspector Panel shows profile and security context.

Always visible:

- User list.
- Role/status.
- Add User where permitted.

Hidden until needed:

- Advanced login history.
- MFA policies.

### Roles & Permissions

Purpose: Controlled permission and role governance.

Structure:

- Workspace Header identifies Roles & Permissions.
- Data Grid lists roles.
- Details / Inspector Panel shows permission groups.
- Action Bar supports safe role changes where permitted.

Always visible:

- Role list.
- Permission summary.

Hidden until needed:

- Fine-grained permission editor.
- Role designer.
- Bulk permission tools.

### Activity Logs

Purpose: Audit and operational traceability.

Structure:

- Workspace Header identifies Activity Logs.
- Search Area and Filter Area support user, action, module, status, and date.
- Data Grid lists activity records.
- Details / Inspector Panel shows metadata in readable form.

Always visible:

- Activity list.
- Date/user/action filters.

Hidden until needed:

- Technical metadata.
- Export.
- Advanced audit review.

### Notifications

Purpose: Central visibility for system, workflow, and operational notices.

Structure:

- Workspace Header identifies Notifications.
- Filter Area supports type, status, priority, and date.
- Data Grid or Activity Feed lists notifications.
- Details / Inspector Panel shows full message and action context.

Always visible:

- Notification list.
- Priority/status.

Hidden until needed:

- Background job diagnostics.
- Advanced routing rules.

### Settings

Purpose: Safe store and application configuration.

Structure:

- Workspace Header identifies Settings.
- Context Toolbar provides settings category navigation.
- Primary Workspace shows the current settings group.
- Details / Inspector Panel may explain selected settings.
- Action Bar provides Save and Cancel.

Always visible:

- Category context.
- Current settings group.
- Save state.

Hidden until needed:

- Advanced settings.
- Dangerous actions.
- Feature configuration.

### License

Purpose: Future license status and commercial entitlement visibility.

Structure:

- Workspace Header identifies License.
- KPI / Statistics show license state and edition context.
- Primary Workspace shows entitlement summary.
- Status Area shows validation state.

Always visible:

- Edition.
- License status.
- Expiry or renewal context where applicable.

Hidden until needed:

- Activation.
- Revocation.
- Device binding.
- Platform Owner tools.

### Backup & Restore

Purpose: Data safety workflow.

Structure:

- Workspace Header identifies Backup & Restore.
- Primary Workspace shows backup status and safe actions.
- Details / Inspector Panel explains last backup and restore implications.
- Action Bar separates routine backup from risky restore.

Always visible:

- Last backup state.
- Backup action.
- Restore caution context.

Hidden until needed:

- Advanced schedule.
- Cloud backup.
- Technical logs.

### Platform

Purpose: Future platform-level security, licensing, diagnostics, devices, and support.

Structure:

- Workspace Header identifies Platform.
- Primary Workspace shows platform status by authorized role.
- Data Grid may list devices, sessions, diagnostics, or support events when implemented.
- Details / Inspector Panel shows selected platform item context.

Always visible:

- Platform status for authorized users.
- Restricted access state where unauthorized.

Hidden until needed:

- Platform Owner tools.
- Device revocation.
- Diagnostic mode.
- Support mode.

## 7. Cross-Module Rules

### Search Behavior

Search belongs close to the data or workflow it controls.

Search should support keyboard-first use, fast reset, and predictable empty states.

### Filter Placement

Filters must appear before the data they affect.

Advanced filters should remain hidden until needed.

### Bulk Actions

Bulk actions must appear only after selection exists or when the workflow clearly supports them.

Bulk actions must never look available when no valid selection exists.

### Selection Model

Selection must be visible, stable, and clearly separated from opening details.

Checkbox selection, row selection, and active detail selection must not conflict.

### Tabs

Tabs may divide related views inside the same module.

Tabs must not hide primary filters, break layout, or pretend unavailable features are active.

### Inspector Panels

Inspector panels provide secondary context without interrupting the main workflow.

Inspector panels must not replace the primary workspace.

### Split View

Split view may be used when list/detail productivity improves.

Split view must preserve keyboard flow and must not crowd cashier workflows.

### Dialogs

Dialogs are for focused forms, confirmations, and required decisions.

Routine workflows should avoid unnecessary dialogs.

### Navigation Consistency

Navigation must follow approved workspace and module terminology.

Modules must not create alternate navigation structures without approval.

## Command Palette and Context Actions

Future desktop workflows may support command palette and context actions.

Governance:

- Command palette readiness must preserve official terminology.
- Commands must map to approved actions and workflows.
- Command access must respect permissions, licensing, and product edition.
- Context menus must remain consistent across similar data and workflow surfaces.
- Shortcut discoverability must help expert users without distracting new users.
- Command and context actions must not bypass normal validation or authorization.

This section defines future readiness only. It does not implement command palette behavior.

## Data Selection and Bulk Workflow Pattern

Data-heavy modules must use consistent selection behavior.

Governance:

- Single selection must clearly identify the active record.
- Multi-selection must be visually distinct from active detail selection.
- Selected count should be visible when bulk actions are available.
- Bulk action visibility must depend on valid selection.
- Bulk operations must be permission-aware.
- Bulk operations must never appear active when the user cannot perform them.
- Destructive bulk operations require deliberate confirmation.

Selection behavior must not conflict with opening details, row actions, or inspector panels.

## Notification and Status Area Pattern

Modules must place workflow feedback consistently.

Governance:

- Success messages confirm completed actions.
- Warning messages appear before risky continuation.
- Validation messages appear near the relevant workflow, field, or action.
- Error messages preserve layout and explain next steps.
- Permission notices appear where restricted actions are encountered.
- Licensing notices appear where locked capabilities are encountered.
- Background processing indicators appear in a stable status area.

Notification and status areas must not push data grids, action bars, or primary workflows
unpredictably.

## Daily Operations Pattern

Future daily operations workflows must support commercial store routines.

Governance:

- Opening shift structures should surface readiness and required starting actions.
- Closing shift structures should surface totals, exceptions, and review needs.
- Cashier handoff structures should preserve accountability and minimize repeated entry.
- Manager review structures should summarize operational exceptions before deep detail.

Daily operations must not make the default Billing workflow slower.

## Approval / Review Workflow Pattern

Future approval and review workflows must be structured consistently.

Applicable future workflows include:

- Purchases.
- Returns.
- Expenses.
- Stock Adjustments.
- Other approval workflows.

Governance:

- Approval screens must show request context, risk, current status, and available decision actions.
- Review workflows must separate routine review from destructive or irreversible actions.
- Permission and role requirements must be visible where decisions are made.
- Approval history should remain available where auditability matters.

No approval workflow may bypass service-layer authorization or official product terminology.

## 8. Keyboard Productivity

Wireframes must preserve keyboard-first desktop use.

Rules:

- Primary workflows must be reachable without excessive mouse use.
- Focus order must match workflow order.
- Billing has the highest keyboard priority.
- Search-first workflows must support fast entry and reset.
- Escape and Enter behavior must be predictable where appropriate.
- Keyboard shortcuts must not conflict with normal text entry.

## 9. Accessibility

Wireframes must support accessibility before visual design.

Rules:

- Reading order must be logical.
- Focus order must be predictable.
- Status must not depend on color alone.
- Permission and license states must be understandable.
- Dialogs must have clear entry and exit.
- Dense layouts must remain readable.
- Error and validation states must be close to the relevant workflow.

## 10. Future ERP Module Readiness

Future ERP modules must extend approved workspace patterns.

Future modules may include:

- CRM
- HR
- Manufacturing
- Accounting
- Projects
- Service Management
- Plugin Modules

ERP readiness rules:

- ERP modules must join an approved workspace or require a documented workspace amendment.
- CRM capabilities should extend the Customers workspace unless formally approved otherwise.
- HR capabilities should extend Control or another approved workspace based on owner-approved scope.
- Manufacturing capabilities should extend Stock or another approved workspace based on workflow
  need.
- Accounting and Finance capabilities are future ERP capabilities within the Money workspace; they
  do not create a new official workspace name.
- Projects and Service Management must join an approved workspace or require a documented workspace
  amendment.
- Plugin Modules must declare the approved workspace they extend.
- ERP depth must not enter Billing by default.
- Advanced ERP flows must use progressive disclosure.
- High-density ERP screens must remain accessible.
- Plugin modules must follow Product Language, Layout Patterns, and Component Library governance.

## Future ERP Screen Pattern

Future ERP screens must reuse approved screen anatomy before proposing new structures.

Governance:

- ERP screens may be denser when trained users benefit from density.
- ERP screens must preserve official workspace terminology.
- ERP screens must support inspector/detail workflows where data relationships are complex.
- ERP screens must preserve accessibility and keyboard productivity.
- ERP screens must keep approval, audit, and permission context visible where relevant.
- ERP screens must not make simple POS editions more complex by default.

## 11. Governance Rules

Module wireframes must be reviewed against:

- Product Experience Blueprint
- Product Language and Terminology Standard
- Product Design Constitution
- Design Tokens
- Component Library Specification
- Layout Patterns
- Cashier speed
- Desktop productivity
- Accessibility
- Future ERP scalability

Before introducing a new module wireframe pattern, document:

1. Workflow need.
2. Why existing patterns are insufficient.
3. Workspace affected.
4. Modules affected.
5. Productivity impact.
6. Accessibility impact.
7. Future ERP impact.
8. Product Owner approval.

No module may create a conflicting screen structure silently.

## 12. Relationship to Document 27 (UI Prototype)

This document defines screen-level structures and interaction layouts at a governance level.

Document 27 (UI Prototype) defines visual composition after these wireframe structures are approved.

Document 27 must not introduce new product experience decisions, terminology, layout patterns,
components, or token meanings that conflict with this document or its higher authorities.

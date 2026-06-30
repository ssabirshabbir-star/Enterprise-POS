# Layout Patterns

## Document Metadata

| Field         | Value                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document      | Layout Patterns                                                                                                                                                                                          |
| Version       | Draft v1                                                                                                                                                                                                 |
| Status        | Draft for Review                                                                                                                                                                                         |
| Scope         | Product layout principles and reusable layout patterns                                                                                                                                                   |
| Applies To    | Desktop POS; Future Web Edition; Future Cloud Edition; Future ERP Editions                                                                                                                               |
| Depends On    | 20_ENTERPRISE_PRODUCT_EXPERIENCE_BLUEPRINT.md; 21_ENTERPRISE_PRODUCT_LANGUAGE_AND_TERMINOLOGY_STANDARD.md; 22_PRODUCT_DESIGN_CONSTITUTION.md; 23_DESIGN_TOKENS.md; 24_COMPONENT_LIBRARY_SPECIFICATION.md |
| Next Document | 26_DESKTOP_UX_RULES.md                                                                                                                                                                                   |

## 1. Purpose

This document defines the layout patterns that guide Enterprise POS screens and workspaces.

The purpose is to make every screen feel like part of the same premium, colorful, commercial,
desktop-first product while protecting speed, readability, cashier productivity, manager clarity,
and future ERP expansion.

This document does not define implementation code, CSS, component markup, pixel values, wireframes,
or prototypes.

## 2. Scope

This document governs layout philosophy for:

- Desktop App Shell
- Workspace Layout
- POS Billing Layout
- Data Management Layout
- Reports / Analytics Layout
- Settings / Administration Layout
- Modal / Drawer / Panel Layout
- Empty / Loading / Error / Permission States
- Responsive Desktop Behavior
- Accessibility and Keyboard Productivity

This document does not replace the Product Experience Blueprint, Product Language Standard, Product
Design Constitution, Design Tokens, or Component Library Specification.

## Layout Authority

Document hierarchy:

- Product Constitution is higher authority.
- Product Design Constitution governs design philosophy.
- Design Tokens govern visual variables.
- Component Library governs reusable UI components.
- Layout Patterns govern page and workspace structure.
- Module Wireframes (Document 26) define module-specific screen layouts.
- UI Prototype (Document 27) defines visual composition.
- Implementation (Document 28) translates approved designs into production UI.

This document defines layout principles only. It must not override architecture, terminology, design
tokens, or component definitions.

## 3. Layout Principles

Enterprise POS layout must follow these principles:

- Commercial POS first.
- Desktop productivity before decoration.
- Cashier speed before visual flourish.
- Calm workspaces for long working hours.
- Colorful identity used with discipline.
- Information hierarchy before component placement.
- Progressive complexity for advanced workflows.
- Role-aware workspace organization.
- Consistent layout rhythm across modules.
- No module-specific layout language unless formally approved.

Every layout must answer:

1. Where am I?
2. What is most important now?
3. What can I do next?
4. What needs attention?
5. What details are available if needed?

## 4. Desktop App Shell Pattern

The Desktop App Shell is the persistent product frame.

It must support:

- Role-aware workspace access.
- Persistent orientation.
- Current user and status awareness.
- Fast switching between approved workspaces.
- Clear separation between navigation, workspace, and system status.
- Future Platform and Sync visibility without crowding cashier workflows.

The shell should feel premium and recognizable, but it must not steal attention from the active
business task.

The shell must not become a flat list of every feature as the product grows.

## 5. Workspace Layout Pattern

Each workspace represents a business family:

- Sell
- Stock
- Customers
- Money
- Growth
- Control
- Platform

Workspace layouts must provide:

- Workspace identity.
- Module-level context.
- Primary action placement.
- Command/search area where useful.
- Main workspace area.
- Context or details area where useful.
- Compact feedback area.

Workspace layouts must allow simple stores to remain simple while giving future ERP editions room
for deeper tools.

## 6. POS Billing Layout Pattern

Billing is the Fast Cashier Console.

Billing layout must prioritize:

- Scanner/search focus.
- Cart visibility.
- Sale total visibility.
- Payment method visibility.
- Pay Now visibility.
- Customer context for credit workflows.
- Receipt actions after sale.
- Keyboard-first operation.

Billing must minimize:

- Mouse travel.
- Repeated data entry.
- Unnecessary dialogs.
- Hidden sale-critical information.
- ERP complexity.

Advanced actions such as split payment, refund/exchange, batch selection, expiry handling, tax
depth, or price override reasoning must appear only when needed, licensed, enabled, and relevant.

## 7. Data Management Layout Pattern

Data Management applies to modules such as Products, Inventory, Purchases, Purchase Orders,
Suppliers, Customers, Completed Invoices, Returns, and Expenses.

Data Management layouts must support:

- Search and filters near the data they control.
- Stable data grid area.
- Direct row actions.
- Clear status visibility.
- Details or inspector area where useful.
- Add/New primary action.
- Empty, loading, filtered-empty, and error states.

Data-heavy screens may be denser than Billing or Settings, but must remain readable and stable.

Tables must not overflow unpredictably, hide critical actions, or change layout when messages
appear.

## 8. Reports / Analytics Layout Pattern

Reports and analytics layouts must support decision-making, not decoration.

Reports layouts must provide:

- Report family selection.
- Date and context filters.
- Summary metrics.
- Chart or visualization area where useful.
- Data table or drill-down area.
- Export/print actions where supported.

Analytics should help managers and owners move from insight to action.

Dashboards belong to role landing experiences and operational summaries. Full analysis belongs in
Reports.

## 9. Settings / Administration Layout Pattern

Settings and Administration layouts must feel calm, safe, and controlled.

These layouts must support:

- Category navigation.
- Clear current setting group.
- Safe Save and Cancel behavior.
- Dangerous actions separated from routine actions.
- Progressive disclosure for advanced settings.
- Permission-aware visibility.
- Clear confirmation before risky actions.

Settings must not feel like a dashboard or cashier workspace.

Administration layouts must protect users from accidental destructive actions.

## 10. Modal / Drawer / Panel Layout Rules

Modals, drawers, and panels must have a clear reason to exist.

Use modal-style layouts for:

- Focused forms.
- Confirmation.
- Small contained workflows.
- Required decisions.

Use drawer or side-panel-style layouts for:

- Record details.
- Inspector views.
- Secondary context.
- Non-blocking reference information.

Rules:

- The user must always understand what opened and how to close it.
- Focus must remain predictable.
- Escape behavior should be supported where safe.
- Primary and secondary actions must be clear.
- Dangerous actions must explain consequences.
- Long forms should use progressive grouping rather than crowding.

## 11. Empty / Loading / Error / Permission Layout States

Every layout must define non-disruptive states for:

- Empty data.
- Filtered-empty data.
- Loading.
- Error.
- Permission denied.
- Feature locked by license or edition.
- Phase 2 / not available yet.

State layouts must:

- Preserve the surrounding layout.
- Avoid pushing important content unpredictably.
- Explain what happened.
- Tell the user what they can do next.
- Avoid technical implementation language.

Permission and licensing states must not look like broken screens.

## 12. Responsive Desktop Rules

Enterprise POS is desktop-first.

Layouts must support:

- 1366x768 production usage.
- Larger desktop monitors.
- High-density data screens.
- Long cashier sessions.
- Windows scaling.
- Future multi-monitor workflows.

Responsive desktop behavior must prioritize:

- Stable navigation.
- Stable primary actions.
- Predictable table behavior.
- No toolbar overlap.
- No hidden critical buttons.
- No unnecessary horizontal scroll unless data genuinely requires it.

Future Web, Cloud, Mobile, and companion applications may adapt layouts to their platforms while
preserving the same Product Design Philosophy.

## Window and Viewport Behavior

Layouts must preserve critical workflows at the minimum supported desktop viewport.

Window and viewport behavior must support:

- Minimum supported desktop viewport for production use.
- Large monitor expansion without excessive empty space.
- Window resizing without hiding critical actions.
- Preservation of Billing, navigation, table, form, and payment workflows.
- Stable primary action access after resize.
- No hidden critical actions after resize.

Large monitors should improve visibility, context, and multitasking without changing the core
workflow model.

## Scroll and Sticky Region Rules

Scrolling must be predictable and must not hide critical workflow actions.

Layout governance for scroll and sticky regions:

- Main content may scroll when content exceeds available space.
- Dense data regions may have their own controlled scroll area.
- Sticky headers may be used to preserve table or workspace context.
- Sticky toolbars may be used when actions must remain available during long lists.
- Sticky action bars may be used when primary workflow actions must remain reachable.
- Sticky status areas may be used for compact workflow state or background activity.
- Nested scrolling should be avoided wherever possible.

Sticky regions must not overlap data, hide row actions, or block keyboard navigation.

## Status and Notification Placement

Messages and notifications must appear in consistent, non-disruptive locations.

Placement guidance:

- Success messages should appear near the workflow they confirm.
- Validation messages should appear near the field, form, or action that requires correction.
- Warning messages should appear before the risky action proceeds.
- Error messages should preserve the layout and explain what can be done next.
- Permission and licensing notices should appear where the unavailable capability is encountered.
- Background processing indicators should appear in a stable status area and must not interrupt safe
  unrelated work.

Messages must not push tables, toolbars, or primary actions unpredictably.

## Multi-Monitor Readiness

Enterprise POS may support multi-monitor workflows in the future.

Potential future uses include:

- Customer display.
- Manager dashboard.
- Reports.
- Monitoring.
- Secondary workspace.

Multi-monitor support must preserve the same Product Design Philosophy and must not make the primary
desktop workflow dependent on a second screen.

## 13. Accessibility and Keyboard Productivity Rules

Layout must support accessibility and keyboard productivity from the beginning.

Rules:

- Reading order must be logical.
- Focus order must match workflow order.
- Primary actions must be reachable by keyboard.
- Keyboard shortcuts must not conflict with text entry.
- Dense layouts must remain legible.
- Status and permission states must not rely on color alone.
- Messages must not steal focus unless user action is required.
- Long workflows must avoid focus traps.

Cashier workflows have the highest keyboard priority.

## 14. Do / Don't Rules

Do:

- Keep Billing fast and focused.
- Keep manager screens decision-oriented.
- Keep data-heavy screens stable and readable.
- Use workspace families instead of module clutter.
- Show advanced complexity only when needed.
- Preserve official terminology.
- Keep messages compact and non-blocking.
- Use direct row actions where they reduce workflow cost.

Don't:

- Turn every screen into a dashboard.
- Put ERP complexity in the cashier path by default.
- Use active-looking placeholders for unavailable features.
- Let messages push tables or actions unpredictably.
- Hide sale-critical actions.
- Create module-specific layout languages.
- Use decoration that reduces productivity.
- Let visual polish override operational speed.

## 15. Governance Rules

Layout changes must be reviewed against:

- Product Experience Blueprint
- Product Language and Terminology Standard
- Product Design Constitution
- Design Tokens
- Component Library Specification
- Cashier speed
- Desktop productivity
- Accessibility
- Commercial clarity
- Future ERP scalability

Before introducing a new layout pattern, document:

1. The workflow need.
2. Why existing patterns are insufficient.
3. Modules affected.
4. Productivity impact.
5. Accessibility impact.
6. Future ERP impact.
7. Product Owner approval.

No module may create a new layout pattern silently.

## 16. Future ERP Extension Notes

Future ERP capabilities must extend existing workspace patterns.

ERP expansion should use:

- Additional depth inside Stock, Money, Control, Growth, or Platform workspaces.
- Progressive disclosure.
- Permission-aware and license-aware visibility.
- Data-heavy layouts for trained users.
- Calm review/approval layouts for risky workflows.

Future ERP and enterprise expansion may include:

- CRM.
- HR.
- Manufacturing.
- Finance & Accounting.
- Platform modules.
- Plugin modules.

ERP expansion must not:

- Slow the default Billing workflow.
- Turn simple stores into configuration-heavy environments.
- Break official terminology.
- Create separate visual products inside the same application.

The layout system must allow Enterprise POS to grow without losing its commercial POS speed.

## Relationship to Document 26

This document defines layout principles only.

Module Wireframes (Document 26) define screen-level structures and interaction layouts.

Document 26 must follow this document and must not introduce layout patterns that conflict with this
governance without formal approval.

# Enterprise Product Experience Blueprint v1.0

## Document Metadata

| Field         | Value                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| Document      | Enterprise Product Experience Blueprint                                    |
| Version       | 1.0                                                                        |
| Status        | Approved                                                                   |
| Scope         | Product Experience                                                         |
| Applies To    | Desktop POS; Future Web Edition; Future Cloud Edition; Future ERP Editions |
| Depends On    | Project Constitution; Architecture Rules; Product Philosophy               |
| Next Document | 21_PRODUCT_DESIGN_CONSTITUTION.md                                          |

## Table of Contents

1. Executive Product Vision
2. Product Personality
3. Final Navigation Architecture
4. Business Workspace Architecture
5. Role-Based Experience
6. Final Module Blueprints
7. Information Architecture Summary
8. Workflow Validation
9. Commercial Differentiation
10. Future ERP Expansion
11. Visual Density Rules
12. Blueprint Validation
13. Final Decision
14. Governance Rules
15. Major Product Decisions
16. Document Authority
17. Future Product Design Documentation Roadmap

## 1. Executive Product Vision

Enterprise POS will become a **role-aware desktop retail operating system**.

Its core promise:

**Sell faster today. Control the business better tomorrow. Grow into ERP without making the cashier
suffer.**

The product experience must prioritize:

- Cashier speed
- Operational clarity
- Low mouse travel
- Strong keyboard flow
- Manager decision speed
- Progressive complexity
- Commercial polish
- Future ERP expansion

Enterprise POS is not a generic POS, not an ERP dashboard, and not a template admin panel. It is a
premium commercial desktop product where each role lands in the right workspace, sees only useful
complexity, and can act quickly.

## 2. Product Personality

Enterprise POS should feel:

- **Professional:** every screen supports real business operations.
- **Premium:** polished enough to sell confidence before training begins.
- **Friendly:** not intimidating for cashiers or small-store owners.
- **Confident:** strong defaults, clear actions, predictable automation.
- **Modern:** fast, structured, and visually memorable.
- **Calm:** long-shift usage must not feel exhausting.
- **Fast:** the interface must reward muscle memory.

The emotional identity is:

**Calm power.**

The product should feel capable, but not heavy. Beautiful, but never decorative at the expense of
speed.

## 3. Final Navigation Architecture

Final model:

**Role-Aware Workspace Shell with Persistent Left Navigation and Context Header**

Enterprise POS should use:

- Persistent left navigation for orientation
- Workspace families instead of flat module clutter
- Context header for current module, search, status, user, and quick actions
- Role-based default landing screen
- Keyboard-accessible global command/search in the future

Why this decision wins:

- Faster than top navigation for desktop module switching
- More scalable than a flat sidebar
- Less complex than a ribbon
- Better for ERP growth than a pure POS layout
- Familiar enough for users, distinctive enough for brand identity

The sidebar remains, but it evolves from "module list" into **business workspaces**.

## 4. Business Workspace Architecture

Permanent business families:

1. **Sell**
   - Billing
   - Returns
   - Completed Invoices / Sales History
   - Reprint
   - Customer selection during sale

2. **Stock**
   - Products
   - Inventory
   - Purchases
   - Purchase Orders
   - Suppliers

3. **Customers**
   - Customers
   - Credit ledger
   - Payment history
   - Communication

4. **Money**
   - Expenses
   - Reports
   - Sales summaries
   - Cash/payment views
   - Profit views

5. **Growth**
   - Lucky Draw
   - Promotions later
   - Loyalty later
   - AI paid capabilities later

6. **Control**
   - User Management
   - Roles
   - Settings
   - Backup/restore
   - Store configuration

7. **Platform**
   - Licensing later
   - Device control later
   - Diagnostics later
   - Support mode later
   - Platform Owner tools later

This structure keeps today's POS simple while creating a clean path to ERP.

## 5. Role-Based Experience

### Cashier

Default landing: Billing.

Experience:

- Minimal navigation
- Search/scanner-first
- Keyboard shortcuts visible but not intrusive
- Payment, customer, receipt, and cart always reachable
- No ERP clutter
- No analytics unless required

Primary need: speed.

### Senior Cashier

Default landing: Sell workspace.

Experience:

- Billing
- Returns
- Reprint
- Held carts
- Customer credit checks
- Basic exception handling

Primary need: fast resolution of sale problems.

### Store Manager

Default landing: Store Health Dashboard.

Experience:

- Today's sales
- Low stock
- overdue dues
- pending purchase orders
- returns
- staff activity
- quick links to Inventory, Purchases, Customers

Primary need: daily control.

### Branch Manager

Default landing: Branch Operations.

Experience:

- Stock movement
- supplier status
- purchasing
- returns
- expenses
- branch performance
- alerts

Primary need: operational supervision.

### Administrator

Default landing: Control workspace.

Experience:

- users
- roles
- settings
- backups
- permissions
- system health

Primary need: safe configuration.

### Owner

Default landing: Owner Command Center.

Experience:

- profit indicators
- cash flow
- sales trend
- stock value
- dues
- expenses
- suspicious activity
- top products/customers

Primary need: business truth.

### Future ERP User

Default landing: ERP workspace depending on licensed edition.

Experience:

- approvals
- multi-branch controls
- advanced reporting
- price lists
- tax/costing
- batch/FIFO/FEFO
- audit trails

Primary need: depth without disturbing POS users.

## 6. Final Module Blueprints

### Dashboard

Purpose: Business health and role-based decision center.

Primary workflow: See store condition, identify issues, jump to action.

Secondary workflow: Drill into reports, inventory, dues, purchases, returns.

Information hierarchy:

1. Critical alerts
2. Today's performance
3. Cash/sales/payment summary
4. Stock risk
5. Customer/supplier risk
6. Recent activity
7. Growth/engagement signals

Primary actions:

- Refresh
- Go to Billing
- View low stock
- View dues
- View pending POs
- View returns

Secondary actions:

- Export/report
- Detailed analytics
- Custom dashboard later

Always visible:

- Today sales
- cash/payment position
- low stock
- pending operational alerts

Collapsible:

- charts
- recent activity
- category breakdowns

Hidden until needed:

- advanced analytics
- forecasting
- branch comparisons

Move elsewhere:

- full reports belong in Reports
- user admin belongs in Control

Text wireframe:

```text
HEADER
Role-aware title + date + refresh

CRITICAL ALERT STRIP
Low stock / overdue dues / pending PO / returns

TODAY SUMMARY
Sales / payments / invoices / profit indicator

OPERATIONS SNAPSHOT
Inventory risk / purchases / returns / expenses

MANAGER ACTIONS
Quick links to priority modules

RECENT ACTIVITY
Latest sales, returns, stock changes

INSIGHTS
Charts and trends
```

### Billing

Purpose: Fastest possible sale completion.

Primary workflow: Scan/search product -> add to cart -> adjust if needed -> choose payment -> Pay
Now -> receipt.

Secondary workflow: Customer selection, credit sale, discount, reprint, WhatsApp, cart switching.

Information hierarchy:

1. Product entry/search
2. Cart
3. Totals
4. Payment
5. Customer
6. Receipt actions
7. Exceptions

Primary actions:

- Search/scan
- add item
- quantity edit
- payment method
- Pay Now

Secondary actions:

- discount
- customer
- print
- reprint
- WhatsApp
- clear cart

Always visible:

- search/scanner input
- cart
- total
- payment method
- Pay Now
- selected customer/payment state

Collapsible:

- receipt preview
- advanced customer details
- held carts

Hidden until needed:

- split payment
- refund/exchange
- advanced tax
- price override reason
- expiry/batch selection unless enabled

Move elsewhere:

- full returns workflow belongs in Returns
- completed invoice history belongs in Sales History

Text wireframe:

```text
HEADER
Sell mode + cashier + status

SEARCH / SCAN COMMAND
Barcode, product search, quick quantity grammar later

MAIN CART
Items, qty, price, discount, total

SALE CONTEXT
Customer, cart tabs, policy badges

PAYMENT SUMMARY
Subtotal, discount, total, received, change

PAYMENT ACTIONS
Cash/Card/Bank/Credit + Pay Now

RECEIPT ACTIONS
Print, reprint, WhatsApp, PDF

MESSAGES
Compact non-blocking sale feedback
```

### Products

Purpose: Maintain product master data.

Primary workflow: Search/list products -> add/edit product -> manage price/policy/basic stock
identity.

Secondary workflow: categories, brands, units, import/export later.

Information hierarchy:

1. product search
2. product list
3. stock/price/status
4. policies
5. catalog metadata

Primary actions:

- Add Product
- Edit
- Activate/deactivate
- Search/filter

Secondary actions:

- import/export
- barcode tools
- category/brand/unit management

Always visible:

- search
- filters
- product list
- add product

Collapsible:

- advanced product policies
- expiry settings
- price override settings

Hidden until needed:

- variants
- multi-unit
- price lists
- tax rules
- promotions

Move elsewhere:

- inventory movement belongs in Inventory
- purchase pricing history belongs in Purchases/Reports

Text wireframe:

```text
HEADER
Products + Add Product

SEARCH AND FILTERS
Category / brand / unit / status

PRODUCT GRID
Name, barcode, category, stock, price, status, actions

DETAIL / MODAL
Basic information

COLLAPSIBLE ADVANCED POLICIES
Price override, auto sale price update, expiry tracking

MESSAGE AREA
Compact save/error state
```

### Inventory

Purpose: Show stock truth and allow safe adjustments.

Primary workflow: Review stock -> filter risks -> adjust stock when authorized.

Secondary workflow: movement history, barcode/image, warehouse later.

Information hierarchy:

1. stock risks
2. product stock list
3. current quantity/value
4. movement/adjustment
5. supplier/category context

Primary actions:

- Adjust stock
- Search/filter
- View movement

Secondary actions:

- barcode print later
- transfer later
- import/export later

Always visible:

- stock list
- filters
- low/out-of-stock indicators
- stock value summary

Collapsible:

- adjustment form
- movement history
- product details

Hidden until needed:

- warehouse transfer
- batch/FIFO/FEFO
- serial tracking

Move elsewhere:

- product creation belongs in Products
- purchase receiving belongs in Purchases

Text wireframe:

```text
HEADER
Inventory + stock health

STATS
Total stock value / low stock / out of stock

FILTERS
Category / brand / supplier / status

STOCK GRID
Product, category, stock, value, supplier, status

DETAIL PANEL
Movement history / adjustment

BOTTOM ACTIONS
Safe placeholders for future advanced actions
```

### Purchases

Purpose: Record supplier purchases and update stock.

Primary workflow: New purchase -> supplier -> items -> costs -> save -> stock updates.

Secondary workflow: view purchase history, payment state, print later.

Information hierarchy:

1. purchase history
2. supplier
3. purchase items
4. totals
5. payment/due
6. stock impact

Primary actions:

- New Purchase
- Save Purchase
- View details
- Clear/cancel draft

Secondary actions:

- print
- export
- payment settlement later

Always visible:

- history/list
- filters
- new purchase
- totals in form

Collapsible:

- advanced payment
- notes
- item-level sale price

Hidden until needed:

- PO conversion
- batch receiving unless enabled
- barcode receiving
- advanced settlement

Move elsewhere:

- PO planning belongs in Purchase Orders
- supplier master belongs in Suppliers

Text wireframe:

```text
HEADER
Purchases + New Purchase

FILTERS
Search, supplier, payment/status/date

PURCHASE HISTORY GRID
Invoice, supplier, total, paid/due, status, actions

PURCHASE FORM MODAL/PANEL
Supplier, date, items, qty, cost, sale price snapshot

TOTALS
Subtotal, discount, tax, paid, due

DETAIL VIEW
Items and purchase summary
```

### Purchase Orders

Purpose: Plan supplier orders before purchase receiving.

Primary workflow: Create PO -> supplier -> products -> quantities -> save -> track status.

Secondary workflow: view details, approve/receive later.

Information hierarchy:

1. PO status
2. supplier
3. expected items
4. warehouse
5. dates
6. totals

Primary actions:

- New PO
- Save PO
- View PO
- Filter/search

Secondary actions:

- approve later
- receive later
- convert later
- print/export later

Always visible:

- PO list
- status filters
- new PO
- next PO number

Collapsible:

- notes
- terms
- warehouse details

Hidden until needed:

- approval workflow
- receiving
- conversion to purchase
- requisitions

Move elsewhere:

- actual stock receiving belongs in Purchases/Inventory phase
- supplier editing belongs in Suppliers

Text wireframe:

```text
HEADER
Purchase Orders + New PO

STATS
Draft / pending / approved / received

FILTERS
Search, supplier, status, date

PO GRID
PO number, supplier, total, status, expected date, actions

PO FORM
Supplier, warehouse, items, qty, cost

DETAIL VIEW
Items, status timeline, notes

PHASE 2 ACTIONS
Approve, receive, convert, print
```

### Suppliers

Purpose: Manage supplier relationships and payable context.

Primary workflow: List suppliers -> add/edit -> view totals/ledger/payment history.

Secondary workflow: WhatsApp, purchase history, statement later.

Information hierarchy:

1. supplier list
2. contact
3. purchase totals
4. paid/due
5. last purchase
6. actions

Primary actions:

- Add Supplier
- Edit
- View
- Payment
- WhatsApp

Secondary actions:

- statement
- aging
- import/export
- bulk actions

Always visible:

- supplier list
- search/filter
- purchase/due totals
- row actions

Collapsible:

- details
- ledger
- purchase history

Hidden until needed:

- supplier scorecard
- contract terms
- advanced aging

Move elsewhere:

- purchase creation belongs in Purchases
- PO creation belongs in Purchase Orders

Text wireframe:

```text
HEADER
Suppliers + Add Supplier

STATS
Total suppliers / purchases / paid / due

FILTERS
Search, status, city

SUPPLIER GRID
Name, phone, totals, due, last purchase, actions

DETAIL PANEL
Profile, purchase history, payments

ACTION AREA
View, Pay, WhatsApp
```

### Customers

Purpose: Manage customer identity, credit, and sales relationship.

Primary workflow: List customers -> add/edit -> view ledger/credit/payment.

Secondary workflow: WhatsApp, groups, VIP later.

Information hierarchy:

1. customer list
2. balance/credit
3. recent activity
4. ledger
5. contact

Primary actions:

- Add Customer
- Edit
- Delete/deactivate
- Payment
- View ledger

Secondary actions:

- WhatsApp
- groups
- import/export
- print

Always visible:

- search
- filters
- customer list
- balance indicators

Collapsible:

- ledger
- details
- payment form

Hidden until needed:

- groups
- loyalty
- customer-specific pricing
- advanced segmentation

Move elsewhere:

- customer sale actions remain in Billing
- reports belong in Reports

Text wireframe:

```text
HEADER
Customers + Add Customer

STATS
Total / active / credit / dues

FILTERS
Search, status, credit state

CUSTOMER GRID
Name, phone, balance, status, actions

DETAIL PANEL
Profile, ledger, payments, recent sales

ACTION AREA
Payment, WhatsApp, placeholder advanced tools
```

### Reports

Purpose: Business truth and decision support.

Primary workflow: Choose report -> filter date/context -> view/export/print.

Secondary workflow: drill-down to source records.

Information hierarchy:

1. report category
2. date range
3. key totals
4. table/chart
5. drill-down

Primary actions:

- Run report
- Filter date
- Print/export where supported
- Drill into record

Secondary actions:

- save report later
- schedule later
- natural language reports later

Always visible:

- report selector
- date filters
- result summary

Collapsible:

- advanced filters
- chart options
- column controls

Hidden until needed:

- custom report builder
- AI reports
- branch comparison
- tax reports unless enabled

Move elsewhere:

- operational alerts belong on Dashboard
- transaction editing belongs in source modules

Text wireframe:

```text
HEADER
Reports

REPORT FAMILY SELECTOR
Sales / inventory / purchases / customers / expenses

FILTERS
Date, status, module-specific filters

SUMMARY
Key numbers

RESULT AREA
Table and chart

DRILL-DOWN
Source transaction details

EXPORT/PRINT ACTIONS
Available if supported
```

### Expenses

Purpose: Record and monitor business expenses.

Primary workflow: Add expense -> categorize -> payment method -> list/report.

Secondary workflow: category management, void/edit.

Information hierarchy:

1. expense list
2. amount/category/date
3. payment method
4. totals

Primary actions:

- Add Expense
- Edit
- Void/delete
- Filter

Secondary actions:

- category create
- export later

Always visible:

- expense list
- add expense
- monthly/today total

Collapsible:

- notes
- category management

Hidden until needed:

- approvals
- recurring expenses
- attachments

Move elsewhere:

- profit reports belong in Reports/Dashboard

Text wireframe:

```text
HEADER
Expenses + Add Expense

STATS
Today / month / category totals

FILTERS
Date, category, payment method

EXPENSE GRID
Date, category, amount, payment, notes, actions

FORM
Amount, category, payment, notes
```

### Lucky Draw

Purpose: Growth and customer engagement.

Primary workflow: Manage campaign -> entries auto-created from eligible sales -> draw/verify
winners.

Secondary workflow: participants, coupons, campaign history.

Information hierarchy:

1. active campaign
2. eligibility
3. entries
4. winners
5. verification

Primary actions:

- Create campaign
- View entries
- Draw winner
- Verify coupon

Secondary actions:

- delete/cancel campaign
- participant tools
- history

Always visible:

- active campaign
- entries count
- winner/verification state

Collapsible:

- history
- participants
- coupon details

Hidden until needed:

- advanced campaign rules
- loyalty integration
- AI targeting

Move elsewhere:

- sale coupon display belongs in Billing/Sales History only as receipt data

Text wireframe:

```text
HEADER
Lucky Draw

ACTIVE CAMPAIGN
Status, threshold, dates

CAMPAIGN ACTIONS
Create, pause/cancel where allowed

ENTRIES GRID
Coupon, invoice, customer, status

DRAW / VERIFY AREA
Winner draw, coupon verification

HISTORY
Past campaigns and winners
```

### User Management

Purpose: Control access safely.

Primary workflow: List users -> add/edit -> activate/deactivate -> reset password.

Secondary workflow: roles, permissions, activity log.

Information hierarchy:

1. user list
2. role/status
3. activity/security state
4. actions

Primary actions:

- Add User
- Edit
- Deactivate/reactivate
- Reset password

Secondary actions:

- role editor later
- permission editor later
- MFA later
- login history later

Always visible:

- user list
- role/status filters
- add user
- security activity summary

Collapsible:

- activity log
- profile details

Hidden until needed:

- fine-grained permission editor
- bulk operations
- import/export
- MFA policies

Move elsewhere:

- Platform Owner functions belong in Platform, never customer User Management

Text wireframe:

```text
HEADER
User Management + Add User

STATS
Active / inactive / locked later / roles

FILTERS
Search, role, status

USER GRID
Name, username, role, status, actions

FORM MODAL
Basic user profile and role

SECURITY ACTIVITY
Read-only activity list

PHASE 2 AREAS
Roles, permissions, MFA
```

### Settings

Purpose: Safe store configuration.

Primary workflow: Configure store identity, printing, backup, general preferences.

Secondary workflow: advanced policies and integrations later.

Information hierarchy:

1. store profile
2. printing
3. backup
4. POS preferences
5. system settings
6. advanced settings

Primary actions:

- Save settings
- Test printer
- Backup
- Restore where safe

Secondary actions:

- integrations
- tax rules
- branch setup later

Always visible:

- category navigation
- current settings group
- save state

Collapsible:

- advanced settings
- dangerous actions

Hidden until needed:

- feature flags
- licensing
- platform owner settings
- ERP configuration

Move elsewhere:

- user permissions belong in User Management
- licensing belongs in Platform

Text wireframe:

```text
HEADER
Settings

SETTINGS CATEGORIES
Store / Printing / Backup / POS / Advanced

CURRENT SETTINGS PANEL
Fields and descriptions

VALIDATION / SAVE AREA
Save, test, confirm

DANGEROUS ACTIONS
Collapsed and permission protected
```

### Sync

Purpose: Future LAN/cloud synchronization readiness.

Primary workflow: Show sync status and health when enabled.

Secondary workflow: manual retry, conflict review later.

Information hierarchy:

1. sync enabled/disabled
2. connection status
3. last sync
4. pending changes
5. errors/conflicts

Primary actions:

- View status
- Retry sync if enabled

Secondary actions:

- conflict resolution later
- cloud account later

Always visible:

- current sync state
- last sync time
- errors if any

Collapsible:

- logs
- technical diagnostics

Hidden until needed:

- cloud setup
- branch sync
- conflict editor

Move elsewhere:

- platform device licensing belongs in Platform
- backups remain in Settings

Text wireframe:

```text
HEADER
Sync Status

STATUS SUMMARY
Enabled/disabled, connection, last sync

QUEUE
Pending changes, failed changes

ACTIONS
Retry, view details

DIAGNOSTICS
Collapsed technical log
```

## 7. Information Architecture Summary

Permanent screen structure:

```text
APP SHELL
Global status, role, workspace

WORKSPACE NAVIGATION
Sell / Stock / Customers / Money / Growth / Control / Platform

MODULE HEADER
Title, purpose, primary action

COMMAND AREA
Search, filters, role-relevant controls

MAIN WORKSPACE
Cart, table, form, report, dashboard, or detail surface

CONTEXT AREA
Totals, selected record, alerts, summary

ACTION AREA
Primary workflow actions first

MESSAGE AREA
Compact, non-blocking feedback
```

## 8. Workflow Validation

### Barcode sales

Billing search/scan remains first-class. No manager/admin clutter in cashier path. Product lookup
and Pay Now remain the shortest path.

### Keyboard workflow

Billing must be fully keyboard-operable. Common actions need stable shortcuts. Future global command
search supports expert users.

### Mouse workflow

Primary actions are spatially predictable. Row actions remain direct. Common actions are not buried.

### Credit sales

Customer context stays near payment. Credit requirements appear before Pay Now failure where
possible. Ledger remains in Customers, not Billing.

### Returns

Returns are separate from Billing but connected to invoice lookup. Billing can link to Returns, not
contain full return workflow.

### Inventory adjustment

Inventory owns adjustments. Products own product identity. Purchases own receiving. This prevents
workflow confusion.

### Purchasing

Purchases and Purchase Orders are related but separate. PO plans intent; Purchase records actual
stock/cost.

### Supplier management

Suppliers own identity, contact, totals, and payments. Purchase creation may link to Suppliers but
not replace it.

### Reporting

Reports provide truth and drill-down. Dashboard provides operational summary. Billing does not
become a report screen.

### Daily opening

Cashier lands in Billing. Manager lands in Dashboard. System should eventually show opening
readiness: printer, database, sync, cash state.

### Daily closing

Manager/Owner needs daily summary, cash/payment totals, expenses, returns, and discrepancies. This
belongs in Money/Dashboard, not Billing.

### Long working hours

Billing must remain calm and predictable. Color and density must support scanning, not fatigue.
Repeated workflows must avoid dialogs unless risk exists.

## 9. Commercial Differentiation

Enterprise POS stands above alternatives by workflow, not imitation.

Compared with SAP:

- Faster and lighter for retail front counter.
- No ERP heaviness in cashier workflow.

Compared with Odoo:

- More cashier-first.
- Less "everything is an app"; stronger operational workspaces.

Compared with Square:

- More desktop productive.
- Better future depth for purchasing, inventory, permissions, ERP growth.

Compared with Shopify POS:

- Better offline desktop control and local business operations.
- More stock/purchase depth.

Compared with Lightspeed:

- Comparable retail ambition, but more locally controlled and constitutionally modular.

Compared with Loyverse:

- More enterprise-ready, stronger architecture, richer future governance.

Compared with ERPNext:

- Less back-office heavy for sales.
- More polished cashier experience.

Compared with Microsoft Office:

- Borrows productivity discipline, not ribbon identity.
- Designed around retail workflows, not document editing.

Enterprise POS should win through:

**fast sale execution + operational control + progressive ERP expansion.**

## 10. Future ERP Expansion

ERP expansion must attach to workspaces, not invade POS basics.

Future ERP additions:

- Variants -> Products/Inventory
- Multi-unit -> Products/Purchases/Billing only when enabled
- FIFO/FEFO -> Inventory/Purchases/Reports
- Advanced tax -> Settings/Billing/Reports
- Price lists -> Products/Customers/Billing
- Promotions -> Growth/Billing
- Multi-branch -> Dashboard/Inventory/Reports/Platform
- Approval workflows -> Purchases/POs/Expenses
- Accounting -> Money
- Device/licensing -> Platform

Rule:

**ERP depth appears where it belongs and only when licensed/enabled.**

Cashiers should not see ERP complexity unless the sale requires it.

## 11. Visual Density Rules

Calm screens:

- Billing
- Settings
- User Management
- Customer details
- Payment/credit workflows

Colorful screens:

- Dashboard summaries
- status alerts
- Growth/Lucky Draw
- high-level KPI cards
- selected active workspace

Dense screens:

- Inventory
- Products
- Purchases
- Purchase Orders
- Reports
- Sales History

Whitespace mandatory:

- Billing search/payment area
- modals/forms
- settings
- dangerous confirmations
- empty states

Dashboards belong:

- role landing screens
- manager/owner overview
- not inside every module

Statistics belong:

- dashboard
- module headers only when directly useful
- reports for deeper analysis

Quick actions belong:

- module header for primary creation
- row actions for direct record work
- bottom/action area only for workflow-specific commands
- not scattered across unrelated panels

## 12. Blueprint Validation

### Can this be simplified?

Yes. The workspace families reduce module clutter and create a simpler mental model than a flat
sidebar.

### Can clicks be reduced?

Yes. Role landing pages, direct row actions, keyboard-first Billing, and workspace grouping reduce
navigation and repeated searching.

### Can keyboard flow improve?

Yes. Billing becomes the highest-priority keyboard surface, and future global command search
supports expert desktop users.

### Can managers work faster?

Yes. Store Manager and Owner land on operational truth rather than raw modules.

### Can enterprise growth remain clean?

Yes. ERP features attach to business families and remain hidden until licensed/enabled.

### Does any business capability disappear?

No. Existing capabilities are preserved, moved, simplified, hidden until needed, or reserved for
Phase 2/ERP edition.

### Does this copy another product?

No. It combines enterprise role awareness, POS speed, desktop productivity, and inventory depth into
an original Enterprise POS operating model.

## 13. Final Decision

Enterprise POS will become:

**A Role-Aware Retail Operating System with a Fast Cashier Console and Progressive ERP Workspaces.**

This is the master product experience direction for all future UI/UX work.

## 14. Governance Rules

This blueprint is the master reference for future product experience decisions.

Any future UI, UX, workflow, navigation, layout, or interaction design must remain consistent with
this blueprint.

If an implementation conflicts with this blueprint, the implementation must be revised unless this
blueprint is formally amended.

Amendments must follow the project's documentation governance process.

This document has higher authority than individual module implementation decisions.

## 15. Major Product Decisions

### Desktop-First Architecture

Enterprise POS is a desktop-first commercial product. This decision protects cashier speed, keyboard
productivity, large-screen density, offline reliability, and long-shift usability.

### Role-Aware Workspace Shell

The product experience is organized around the role currently using the system. Cashiers, managers,
owners, administrators, and future ERP users need different defaults, different visibility, and
different levels of complexity.

### Persistent Left Navigation with Context Header

The product uses persistent left navigation for orientation and a context header for module
identity, status, search, and quick actions. This gives users stable navigation without forcing a
heavy ribbon or generic top-menu experience.

### Business Workspaces Instead of a Flat Module List

Modules are grouped into business families such as Sell, Stock, Customers, Money, Growth, Control,
and Platform. This prevents future module sprawl and gives ERP expansion a clean home.

### Cashier-First Workflow Philosophy

Billing and sale completion are the highest-priority workflows. No advanced ERP, configuration, or
management feature may slow down the cashier path.

### Progressive ERP Expansion

ERP capabilities must expand through the correct workspace instead of invading core POS screens.
This allows the product to grow without making simple retail users carry enterprise complexity.

### Progressive Disclosure of Complexity

Advanced capabilities remain hidden until licensed, enabled, or operationally required. This keeps
the default experience simple while preserving future commercial depth.

### Commercial-First Product Strategy

The product must be commercially attractive, operationally fast, and trustworthy before it becomes
feature-heavy. Beauty, speed, and clarity are treated as business advantages.

### Automation Before AI

Deterministic automation must be preferred wherever rules are sufficient. AI-assisted capabilities
are reserved for cases where they reduce user effort without reducing predictability or business
control.

### Offline-First Core with Future Cloud Expansion

The core POS workflow must remain reliable without cloud dependency. Future LAN, cloud, web, and
sync capabilities must extend the product without weakening local desktop operation.

### Premium Colorful Enterprise Visual Identity

Enterprise POS should keep a memorable premium commercial identity with controlled color, clean
workspaces, and professional energy. The product must avoid looking generic, toy-like, or
template-based.

### Product Experience Governed by This Blueprint

Future UI, UX, workflow, navigation, layout, and interaction decisions must follow this blueprint.
Individual implementation decisions are lower authority unless this blueprint is formally amended.

## 16. Document Authority

### Higher Authority Documents

- Project Constitution
- Architecture Rules
- Commercial Product Philosophy

### This Document Controls

- Product Experience
- Navigation
- Workspace Organization
- Information Architecture
- Role-based UX
- Workflow Direction
- Product Experience Governance

### Future Documents That Must Follow This Blueprint

- 21_PRODUCT_DESIGN_CONSTITUTION.md
- 22_DESIGN_TOKENS.md
- 23_COMPONENT_LIBRARY_SPECIFICATION.md
- 24_LAYOUT_PATTERNS.md
- 25_INTERACTION_PATTERNS.md
- 26_DESKTOP_UX_RULES.md

### Lower Authority Documents

- Module Specifications
- Renderer Implementations
- HTML
- CSS
- Individual UI Components

## 17. Future Product Design Documentation Roadmap

Planned Product Design documentation series:

- 21_PRODUCT_DESIGN_CONSTITUTION.md
- 22_DESIGN_TOKENS.md
- 23_COMPONENT_LIBRARY_SPECIFICATION.md
- 24_LAYOUT_PATTERNS.md
- 25_INTERACTION_PATTERNS.md
- 26_DESKTOP_UX_RULES.md

These are planned placeholders only. They must not be created until separately approved.

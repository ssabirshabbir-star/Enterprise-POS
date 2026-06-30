# Enterprise Product Language & Terminology Standard v1.0

## Document Metadata

| Field         | Value                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| Document      | Enterprise Product Language & Terminology Standard                         |
| Version       | 1.0                                                                        |
| Status        | Approved Terminology Standard                                              |
| Scope         | Product language, naming, messaging, and terminology governance            |
| Applies To    | Desktop POS; Future Web Edition; Future Cloud Edition; Future ERP Editions |
| Depends On    | Project Constitution; Enterprise Product Experience Blueprint              |
| Next Document | 22_PRODUCT_DESIGN_CONSTITUTION.md                                          |

## Purpose

This document is the single source of truth for product terminology across Enterprise POS.

The same language must be used consistently in:

- UI
- Documentation
- Reports
- Help
- Error messages
- Success messages
- Notifications
- AI features
- Future Web Edition
- Future Cloud Edition
- Future ERP Editions

Consistent terminology reduces training cost, prevents workflow confusion, improves localization,
and protects the product from silent language drift.

## Terminology Authority

Higher authority:

- Project Constitution
- Architecture Rules
- Commercial Product Philosophy
- Enterprise Product Experience Blueprint

This document controls:

- Business terminology
- Module names
- Workspace names
- Action names
- Status vocabulary
- Message wording standards
- Confirmation dialog language
- Reserved enterprise terms
- Localization terminology governance

Lower authority:

- Individual module specifications
- UI implementations
- Renderer code
- HTML
- CSS
- Help text
- Report labels
- Notification text

If implementation language conflicts with this standard, the implementation must be revised unless
this document is formally amended.

## Official Product Dictionary

| Official Term      | Deprecated / Never Use                | Reason                                                                     |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------------- |
| Dashboard          | Home, Analytics Home                  | Dashboard is the role-aware business health entry point.                   |
| Billing            | Sales, POS Sale, Checkout Screen      | Billing means the live cashier POS sale screen.                            |
| Completed Invoices | Sales History, Old Bills              | Completed Invoices is clearer for user-facing completed sale records.      |
| Sale               | Transaction as the primary UI term    | Sale is short and cashier-friendly for completed POS activity.             |
| Invoice            | Bill, Old Bill                        | Invoice is the official stored completed sale record.                      |
| Receipt            | Invoice Printout                      | Receipt is the customer-facing proof of sale.                              |
| Product            | Item, Article                         | Product is standard retail language and future ERP compatible.             |
| Products           | Items, Articles                       | Products is the official product master module.                            |
| Inventory          | Warehouse as a generic module name    | Inventory owns stock state and stock movement.                             |
| Stock              | Inventory Quantity                    | Stock is shorter and clearer for available quantity.                       |
| Purchase           | Buying, Supplier Bill                 | Purchase means supplier receiving transaction.                             |
| Purchase Order     | PO as primary label                   | Purchase Order is the formal planned supplier order.                       |
| Supplier           | Vendor                                | Supplier is clearer for retail store users.                                |
| Customer           | Client                                | Customer is universal for POS and future CRM.                              |
| Credit             | Loan, Udhaar as primary UI term       | Credit is professional and report-friendly.                                |
| Expense            | Cost as module name                   | Expense is the official business cost record.                              |
| Payment            | Tender as primary UI term             | Payment is widely understood across cash/card/bank/credit.                 |
| Return             | Refunds as module name                | Return is the broader workflow; refund is only one outcome.                |
| Exchange           | Replacement as module name            | Exchange is the standard retail replacement workflow.                      |
| Discount           | Offer as primary discount term        | Discount is precise for price reduction.                                   |
| Profit             | Margin as primary owner-facing term   | Profit is clearer for commercial users.                                    |
| Loss               | Damage as generic term                | Loss covers margin loss, wastage, and business impact.                     |
| Barcode            | Scan Code                             | Barcode is the common retail identifier.                                   |
| SKU                | Product Code as replacement           | SKU is standard inventory terminology.                                     |
| Campaign           | Scheme, Lottery Plan                  | Campaign supports Lucky Draw and future promotions.                        |
| Lucky Draw Entry   | Coupon only as generic term           | Lucky Draw Entry describes campaign participation.                         |
| Sell               | Sales workspace                       | Sell is action-oriented and cashier-friendly.                              |
| Stock              | Inventory workspace                   | Stock groups product supply and stock truth.                               |
| Customers          | CRM as workspace name                 | Customers is simpler and retail-friendly.                                  |
| Money              | Accounting as default workspace       | Money is owner-friendly and less intimidating.                             |
| Growth             | Marketing as default workspace        | Growth covers Lucky Draw, loyalty, promotions, and AI later.               |
| Control            | Admin Panel                           | Control communicates governed administration.                              |
| Platform           | Settings, Admin, Super Admin          | Platform is reserved for licensing, devices, diagnostics, and owner tools. |
| Pay Now            | Complete, Submit Payment              | Pay Now is the primary cashier completion action.                          |
| Save               | Submit                                | Save is clearer for forms and settings.                                    |
| Cancel             | Close as destructive action           | Cancel means exit without saving or stop an operation.                     |
| Clear              | Delete for temporary data             | Clear means remove temporary cart/form/filter content.                     |
| Reset              | Clear Filters when restoring defaults | Reset means restore default filter/state.                                  |
| Add Product        | Create Item                           | Add is simpler and consistent with UI actions.                             |
| Add Customer       | Create Client                         | Add is consistent for master data creation.                                |
| New Purchase       | Add Purchase                          | New is preferred for transactional documents.                              |
| New Purchase Order | New PO as primary label               | Full term prevents confusion for new users.                                |
| View Details       | Open, See                             | View Details clearly opens record detail.                                  |
| Print Receipt      | Print Invoice                         | Receipt is the correct customer-facing output.                             |
| Verify Coupon      | Check Coupon                          | Verify is more authoritative for validation.                               |
| Draw Winner        | Select Winner                         | Draw Winner matches Lucky Draw terminology.                                |
| Draft              | Temporary                             | Draft means created but not finalized.                                     |
| Pending            | Waiting                               | Pending is standard status language.                                       |
| Completed          | Done                                  | Completed is formal and report-friendly.                                   |
| Cancelled          | Stopped                               | Cancelled is the official voided/stopped state.                            |
| Paid               | Settled as default UI term            | Paid is simpler for users.                                                 |
| Partially Paid     | Partial                               | Partially Paid is explicit.                                                |
| Unpaid             | Not Paid                              | Unpaid is compact and standard.                                            |
| Active             | Enabled as status label               | Active is business-friendly.                                               |
| Inactive           | Disabled as status label              | Inactive preserves history and avoids technical tone.                      |
| Low Stock          | Stock Low                             | Low Stock is the official alert term.                                      |
| Out of Stock       | No Stock                              | Out of Stock is the standard retail phrase.                                |

## Business Vocabulary

| Official Term    | Meaning                                                                       | Why This Term                                                         |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Sale             | A completed customer transaction in the POS workflow.                         | Short, cashier-friendly, and widely understood.                       |
| Invoice          | The official completed sale record stored by the system.                      | Suitable for history, reprint, accounting, and formal references.     |
| Receipt          | The customer-facing print/PDF/WhatsApp proof of sale.                         | Separates customer output from internal invoice record.               |
| Product          | An item or service that can be sold, stocked, purchased, or reported.         | Standard retail term and simpler than item/article.                   |
| Inventory        | The business area that manages stock quantities and movements.                | Describes the system function, not just quantity.                     |
| Stock            | The available quantity of a product.                                          | Short and operationally clear for store users.                        |
| Purchase         | A supplier transaction that receives goods and affects stock/cost.            | Clear distinction from customer sale.                                 |
| Purchase Order   | A planned supplier order before goods are received.                           | Standard procurement term; separates intent from receiving.           |
| Supplier         | A business or person that provides products to the store.                     | Clear retail term, preferred over vendor for this product.            |
| Customer         | A person or organization buying from the store.                               | Universal and future-compatible with CRM features.                    |
| Credit           | A customer balance or deferred payment arrangement.                           | Short and familiar for retail users.                                  |
| Expense          | A business cost recorded outside product purchase cost.                       | Clear for store accounting and reports.                               |
| Payment          | Money received from a customer or paid to a supplier/expense.                 | Broad enough for cash, card, bank, credit, and future methods.        |
| Return           | Customer gives back sold product and receives an approved refund/adjustment.  | Common POS term for reversal workflow.                                |
| Exchange         | Customer replaces one sold product with another.                              | Distinct from refund-only return.                                     |
| Discount         | Reduction applied to a line item or sale total.                               | Universal and simple.                                                 |
| Profit           | Sales value remaining after relevant costs/expenses where available.          | Commercially direct and owner-friendly.                               |
| Loss             | Negative margin, wastage, adjustment, or business cost impact where reported. | Clear financial term.                                                 |
| Barcode          | Scannable product identifier.                                                 | Common cashier/product label.                                         |
| SKU              | Internal product code used by the business.                                   | Standard inventory/product identifier.                                |
| Campaign         | A configured promotional or Lucky Draw program.                               | Useful for Growth workspace and future promotions.                    |
| Lucky Draw Entry | A generated eligible entry/coupon for a Lucky Draw campaign.                  | Clearer than only coupon because it describes campaign participation. |

## Module Vocabulary

Permanent module names:

| Official Module Name | Use For                                        | Avoid                                |
| -------------------- | ---------------------------------------------- | ------------------------------------ |
| Dashboard            | Role-aware business health landing screen.     | Home, Analytics Home                 |
| Billing              | Live cashier POS sale screen.                  | Sales, POS Sale, Checkout Screen     |
| Completed Invoices   | Completed sale history visible to users.       | Sales History in UI, Old Bills       |
| Products             | Product master data.                           | Items, Articles                      |
| Inventory            | Stock state and stock movement.                | Warehouse unless warehouse-specific  |
| Purchases            | Supplier purchase receiving and history.       | Buying, Supplier Bills               |
| Purchase Orders      | Planned supplier orders.                       | PO only as primary label             |
| Suppliers            | Supplier master and payable context.           | Vendors                              |
| Customers            | Customer master, balances, and ledger context. | Clients                              |
| Returns              | Customer return/refund workflow.               | Refunds as module name               |
| Reports              | Business reports and drill-down analysis.      | Analytics as primary module name     |
| Expenses             | Business expense recording.                    | Costs as module name                 |
| Lucky Draw           | Lucky Draw campaigns, entries, and winners.    | Lottery                              |
| User Management      | Customer-side user and role management.        | Platform Owner, Staff Admin          |
| Settings             | Store and application configuration.           | Configuration as primary module name |
| Sync                 | Future sync status and queue visibility.       | Cloud as primary module name         |

Internal/backend names may differ only when needed for technical clarity, but user-facing labels
must follow this vocabulary.

## Workspace Vocabulary

| Workspace | Purpose                                                                    | Why This Name                                                      |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Sell      | Billing, returns, receipts, and completed invoices.                        | Action-oriented and cashier-friendly.                              |
| Stock     | Products, inventory, purchases, purchase orders, and suppliers.            | Groups all product supply and stock truth.                         |
| Customers | Customer records, credit, ledger, and communication.                       | Direct and familiar.                                               |
| Money     | Expenses, reports, cash/payment summaries, and profit views.               | Owner-friendly and broader than accounting.                        |
| Growth    | Lucky Draw, promotions, loyalty, and future AI engagement features.        | Positions optional growth tools separately from operations.        |
| Control   | Users, roles, settings, backup, and store configuration.                   | Communicates governed administrative control.                      |
| Platform  | Future licensing, devices, diagnostics, support, and Platform Owner tools. | Separates product/platform authority from customer administration. |

Workspace names must be short, plain, and business-oriented.

## Action Vocabulary

Use these official action names consistently.

| Official Action    | Use For                                                  | Notes                                                          |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| Pay Now            | Complete the current Billing sale.                       | Primary cashier action.                                        |
| Save               | Persist changes to an existing record or settings group. | Avoid Submit where Save is clearer.                            |
| Cancel             | Close or abandon the current operation without saving.   | Use consistently for non-destructive exit.                     |
| Clear              | Remove temporary form/cart/filter content.               | Use when data is not persisted.                                |
| Reset              | Restore filters or settings to default values.           | Use for filters more than forms.                               |
| Add Product        | Create a product.                                        | Use Add, not Create, in UI.                                    |
| Add Customer       | Create a customer.                                       | Same pattern as Add Product.                                   |
| Add Supplier       | Create a supplier.                                       | Same pattern.                                                  |
| New Purchase       | Start purchase entry.                                    | New is used for transactional documents.                       |
| New Purchase Order | Start a purchase order.                                  | Avoid ambiguous New PO as main label.                          |
| View Details       | Open read-only or detail view.                           | Use instead of View where space allows.                        |
| Edit               | Modify an existing record.                               | Direct and standard.                                           |
| Delete             | Remove a record where permanent or destructive.          | Requires danger confirmation.                                  |
| Deactivate         | Disable without deleting.                                | Preferred for users/customers/suppliers where history matters. |
| Print Receipt      | Print customer receipt.                                  | Use Receipt, not Invoice, for customer output.                 |
| Reprint Receipt    | Print a previous receipt again.                          | Use when receipt already exists.                               |
| Download PDF       | Save receipt/report as PDF.                              | Clear user action.                                             |
| Verify Coupon      | Check Lucky Draw coupon validity.                        | Use Coupon only for verification artifact.                     |
| Draw Winner        | Run Lucky Draw selection.                                | Clear campaign action.                                         |
| Apply Discount     | Apply sale or line discount.                             | Use when action button exists.                                 |
| Adjust Stock       | Create a stock adjustment.                               | Inventory-specific action.                                     |
| Record Payment     | Save customer/supplier payment.                          | Use for ledger/payment entries.                                |

Action labels should be verbs or verb phrases. Avoid technical labels like Execute, Process Payload,
Submit Form, or Invoke.

## Status Vocabulary

| Official Status | Meaning                                                          |
| --------------- | ---------------------------------------------------------------- |
| Draft           | Created but not finalized.                                       |
| Pending         | Waiting for action, review, receipt, or completion.              |
| Completed       | Finished and no longer in progress.                              |
| Cancelled       | Intentionally stopped or voided before completion.               |
| Paid            | Fully paid.                                                      |
| Partially Paid  | Some amount paid, balance remains.                               |
| Unpaid          | No amount paid.                                                  |
| Active          | Available for normal use.                                        |
| Inactive        | Disabled from normal use but preserved for history.              |
| Verified        | Checked and confirmed valid.                                     |
| Expired         | No longer valid due to date/time rules.                          |
| Low Stock       | Stock is below configured threshold.                             |
| Out of Stock    | No available stock remains.                                      |
| Due             | Amount payable or receivable remains.                            |
| Overdue         | Due amount or action has passed expected date.                   |
| Issued          | Generated and available for use.                                 |
| Redeemed        | Used by customer or campaign process.                            |
| Blocked         | Temporarily prevented by security, validation, or business rule. |

Statuses must be short, stable, and reused across UI, reports, and filters.

## Message Style

### Success

Tone: confident and concise.

Pattern:

```text
[Object] saved.
[Action] completed.
Invoice completed.
```

### Warning

Tone: calm and preventive.

Pattern:

```text
Please review [condition] before continuing.
[Object] may need attention.
```

### Information

Tone: neutral and helpful.

Pattern:

```text
[Feature] is not available yet.
No records found.
```

### Error

Tone: clear, professional, non-technical.

Pattern:

```text
Unable to [action]. Please try again.
[Object] could not be loaded.
```

### Validation

Tone: specific and actionable.

Pattern:

```text
Enter [required field].
Select [required option].
[Value] must be greater than [limit].
```

Messages must not expose SQL errors, stack traces, IPC details, file paths, or internal exception
names to end users.

## Confirmation Style

Confirmations should appear only for destructive, risky, irreversible, or high-impact actions.

Structure:

```text
Title: [Action] [Object]?
Body: Explain the consequence in one short sentence.
Primary action: Specific action label
Secondary action: Cancel
```

Examples:

```text
Title: Delete product?
Body: This product will no longer be available, but historical invoices remain unchanged.
Primary action: Delete
Secondary action: Cancel
```

```text
Title: Clear cart?
Body: Current cart items will be removed.
Primary action: Clear Cart
Secondary action: Cancel
```

Danger confirmations must use the actual destructive verb: Delete, Cancel, Deactivate, Void, or
Clear. Avoid vague labels such as Yes, OK, Proceed, or Confirm.

## Reserved Enterprise Terms

These terms are reserved for future platform, ERP, automation, or commercial capabilities.

| Reserved Term  | Meaning                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| Workspace      | A role/business-family area such as Sell, Stock, Money, or Control.                       |
| Automation     | Rule-based system action that reduces manual work while preserving predictability.        |
| AI             | Licensed AI-assisted capability that supports, but does not replace, business control.    |
| License        | Signed commercial entitlement controlling paid capabilities.                              |
| Edition        | Commercial product level or package.                                                      |
| Platform       | System authority above customer organizations, including licensing/devices/support later. |
| Plugin         | Future optional extension package, not core module behavior.                              |
| Workflow       | A complete business process across screens or modules.                                    |
| Command        | A user-triggered action, future command palette item, or keyboard-accessible operation.   |
| Background Job | A non-interactive process such as sync, backup, import, or scheduled task.                |
| Sync           | Future LAN/cloud data synchronization status and process.                                 |

Reserved terms must not be reused casually for unrelated UI labels.

## Terminology Change Policy

Terminology must evolve through controlled amendment, not silent replacement.

Rules:

- The Product Owner is the final authority for terminology changes.
- Existing terminology must become Deprecated before it is removed from documentation or UI.
- New terms must be added to this standard before implementation language is finalized.
- Deprecated terms must include the official replacement and the reason for deprecation.
- UI, reports, help text, messages, and AI responses must migrate to the official term in planned
  cleanup work.
- Internal technical names may lag temporarily only when changing them would create architecture or
  migration risk.
- Terminology changes must be checked against cashier clarity, manager clarity, localization,
  reporting, and future ERP readiness.

Old terminology must never be silently changed in one module while remaining active elsewhere.

## Reserved Product Vocabulary

These product terms are reserved and must keep their official meanings.

| Reserved Term  | Reserved Meaning                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Workspace      | Role or business-family operating area such as Sell, Stock, Money, or Control.                                |
| Platform       | Product authority above customer organizations, including licensing, devices, diagnostics, and support later. |
| Edition        | Commercial package or product tier controlled by licensing.                                                   |
| Plugin         | Future optional extension package, not a normal module or hidden feature.                                     |
| Automation     | Rule-based system behavior that reduces manual work while remaining predictable.                              |
| Workflow       | End-to-end business process across one or more modules.                                                       |
| AI             | Licensed AI-assisted capability that supports user decisions without replacing business control.              |
| Background Job | Non-interactive task such as sync, backup, import, export, or scheduled processing.                           |
| Sync           | Future LAN/cloud data synchronization capability and status.                                                  |
| Owner          | Customer business owner role, not Platform Owner.                                                             |
| Administrator  | Customer organization administrator.                                                                          |
| Cashier        | Front-counter POS operator.                                                                                   |
| Supervisor     | Elevated store operations role between Cashier and Manager where needed.                                      |
| Branch         | A business location in future multi-branch editions.                                                          |
| Store          | The current retail business/location context.                                                                 |

Reserved vocabulary must not be repurposed casually for unrelated buttons, modules, or marketing
labels.

## UI Text Rules

Buttons:

- Use short verb phrases.
- Prefer official action names.
- Avoid vague labels such as OK, Yes, Proceed, or Submit when a specific action exists.

Menu items:

- Use official module or workspace names.
- Keep labels short and stable.
- Do not mix workspace names with module names unless hierarchy is clear.

Module names:

- Use the official module vocabulary exactly.
- Do not invent alternate labels for the same module in different screens.

Titles:

- Use plain business language.
- Match the module, workflow, or record being shown.
- Avoid technical implementation terms.

Messages:

- Be clear, professional, and actionable.
- Use official business terms.
- Avoid stack traces, SQL, IPC, file paths, or raw exception names.

Status badges:

- Use official status vocabulary.
- Keep labels short.
- Do not use color alone to communicate status.

Validation errors:

- State what the user must fix.
- Mention the field or condition directly.
- Avoid blaming the user.

Success notifications:

- Confirm the completed action.
- Keep wording short.
- Avoid unnecessary celebration in routine business workflows.

## Localization Rules

No translations are defined in this document. Localization must follow these governance rules:

- Translate concepts, not file names or internal identifiers.
- Keep one approved localized term per official English term.
- Do not mix multiple translations for the same business concept.
- Preserve distinction between Invoice and Receipt.
- Preserve distinction between Purchase and Purchase Order.
- Preserve distinction between Feature Flags and Licensing.
- Preserve Platform Owner separation from customer administrators.
- Avoid slang in core business actions and statuses.
- Keep action labels short enough for desktop buttons and menus.
- Localized error messages must remain clear, professional, and actionable.

Future localization work must create language-specific terminology maps based on this standard.

## Governance Rules

This document is the authority for Enterprise POS product language.

Any new module, UI text, report, help content, notification, AI response, or documentation must use
the terminology defined here.

If a new business concept is introduced, this document must be updated before implementation
language is finalized.

If implementation terminology conflicts with this document, the implementation must be revised
unless this document is formally amended.

Terminology changes must be reviewed for:

- Cashier clarity
- Manager clarity
- Report consistency
- Future ERP readiness
- Localization impact
- Commercial professionalism

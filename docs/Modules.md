# Enterprise POS Modules

This document records current module status. Do not mark a module complete unless it has passed code
review, validation, and owner manual validation.

## Status Legend

- Complete: validated and ready for normal use in current scope.
- Partially complete: wired and usable for core flows, but known commercial work remains.
- Placeholder only: route or UI exists, but workflow is intentionally not implemented.
- Broken / risky: wired code exists, but a focused audit is required before use or expansion.
- Not started: no meaningful implementation yet.

## Current Module Status

| Module                             |                     Status | Notes                                                                                                          |
| ---------------------------------- | -------------------------: | -------------------------------------------------------------------------------------------------------------- |
| Auth / Session Restore             |         Partially complete | Login, profile restore, refresh tokens, and session restore exist. Main-process logging cleanup remains.       |
| Dashboard                          |         Partially complete | Overview data loads. UI polish and complete dashboard interaction validation remain.                           |
| POS Billing                        |         Partially complete | Stabilized for live POS flow. Split/refund/exchange remain placeholders.                                       |
| Sales History / Completed Invoices |                   Complete | v1 added for completed invoices list, filters, details, and reprint through existing printing API.             |
| Lucky Draw V2                      |         Partially complete | Approved auto-entry path for Billing. Legacy lucky-draw module remains deprecated.                             |
| Products                           |         Partially complete | Stats, catalog filters, search, tabs, edit, and placeholders stabilized. Import/export remain not implemented. |
| Inventory                          |         Partially complete | Rows, adjustment, core buttons, and placeholders stabilized. Transfer/import/export/barcode workflows remain.  |
| Suppliers                          |         Partially complete | Core list, payment, row actions, layout, and placeholders stabilized. Some commercial actions remain.          |
| Customers                          |         Partially complete | CRUD, search, tabs, ledger display, payment note, and placeholders stabilized. Groups/import/export remain.    |
| Returns                            | Partially complete / risky | Lookup, list, and create routes exist. Refund/exchange workflow needs focused audit before use.                |
| Purchases                          | Partially complete / risky | Purchase and supplier flows exist. Stock, supplier ledger, delete rollback, and PO handoff need audit.         |
| Purchase Orders                    | Partially complete / risky | Requisition, approval, receiving, and invoice routes exist. Large repository/service require focused audit.    |
| Reports                            | Partially complete / risky | Many report queries exist. UI/export behavior and large repository need audit.                                 |
| Expenses                           |         Partially complete | CRUD and categories exist. Receipt handling and production workflow need validation.                           |
| Settings                           |         Partially complete | Store, printer, backup, restore, license, and system settings UI exists. Backup/restore hardening remains.     |
| Users / RBAC                       | Partially complete / risky | Users, roles, and permissions exist. Missing dedicated `sales.view`; permission matrix needs audit.            |
| Printing / Receipts                |         Partially complete | Existing printing module supports receipt print/PDF paths. Reliability and unsafe logging cleanup remain.      |
| Backup / Restore                   | Partially complete / risky | Settings module exposes backup/restore. Restore safety needs focused audit.                                    |
| Offline Sync / LAN Readiness       |           Placeholder only | Queue, terminals, and sync tables/routes exist. Multi-terminal conflict handling is not production-locked.     |
| License / Deployment               |         Partially complete | License/update foundations exist. Installer and production hardening remain.                                   |
| Barcode / QR                       |         Partially complete | Product barcode lookup and Lucky Draw coupon values exist. Dedicated barcode/QR workflows remain incomplete.   |
| WhatsApp Invoice                   |         Partially complete | Billing/customer/supplier flows include WhatsApp links in places. Needs app-wide policy and validation.        |
| Email / SMS Integration            |                Not started | No validated production integration.                                                                           |
| Loyalty Program                    |                Not started | Lucky Draw is separate and must not be treated as loyalty.                                                     |
| Tax Engine                         |           Placeholder only | Basic tax fields exist; configurable tax rules are not complete.                                               |
| Discount Engine                    |         Partially complete | Billing line/cart discounts exist; full policy engine is not complete.                                         |
| Shift Management / Daily Closing   |                Not started | Required for commercial POS v1.x.                                                                              |
| Cash Drawer                        |                Not started | No validated hardware integration.                                                                             |
| Multi Store / Warehouse            |           Placeholder only | Warehouse table exists; multi-store operations are not complete.                                               |
| Delivery Orders                    |                Not started | No current workflow.                                                                                           |
| Damaged Stock / Stock Transfer     |           Placeholder only | Inventory placeholders exist; workflows are not implemented.                                                   |
| Audit Logs / Activity Logs         |         Partially complete | Activity logs exist; audit coverage is not complete.                                                           |
| Employee Attendance / Payroll      |                Not started | Payroll remains optional future scope.                                                                         |
| Multi-language Support             |                Not started | No validated i18n layer.                                                                                       |

## Recommended Next Order

1. Foundation Lock Phase 2: logging cleanup and deprecated artifact cleanup.
2. Returns.
3. Purchases.
4. Purchase Orders.
5. Reports.
6. Users / RBAC.
7. Settings and backup/restore hardening.
8. Expenses.
9. Dashboard polish.
10. Installer and production hardening.

## Stabilized Modules To Avoid Touching Without Approval

- Billing business logic
- Lucky Draw V2 auto-entry logic
- Sales History / Completed Invoices v1
- Products basic fixed flows
- Inventory basic fixed flows
- Customers basic fixed flows
- Suppliers basic fixed flows

## Deprecated / Cleanup Areas

These are known cleanup targets for a separate approved task. Do not remove them during feature
work:

- Legacy `src/main/features/lucky-draw`
- Legacy `src/main/features/Login`
- `src/main/_backup_old_structure`
- Root `_archive`
- TypeScript, Prisma, Vite, Vitest, and Playwright remnants
- Backup preload file at repository root

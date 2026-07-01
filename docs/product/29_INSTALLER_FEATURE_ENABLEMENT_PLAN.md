# Installer Feature Enablement Plan

Document: Installer Feature Enablement Plan Version: 1.0 Status: Draft Scope: Installer-level
feature availability planning Applies To:

- Desktop POS installer
- Future packaged desktop releases
- Future edition-based installer profiles

Depends On:

- Project Constitution
- Enterprise Product Experience Blueprint
- Product Language and Terminology Standard
- Product Design Constitution
- Implementation Standards and Reference Strategy

## 1. Purpose

This document defines the safe installer feature enablement strategy for Enterprise POS.

The goal is to make the maximum stable feature set available in installer builds without causing
rework, runtime instability, architecture drift, financial logic corruption, placeholder exposure,
or unsupported workflow activation.

Installer enablement must preserve the approved architecture:

Renderer -> Preload -> Controller -> Service -> Repository -> Database

This plan does not activate features, implement new workflows, redesign UI, change architecture, or
modify business logic. It classifies feature availability for installer planning only.

## 2. Installer Feature Enablement Map

### Dashboard

| Feature                             | Readiness                      | Installer State |
| ----------------------------------- | ------------------------------ | --------------- |
| Sales chart                         | READY FOR INSTALLER ENABLEMENT | Default ON      |
| Payment methods chart               | READY FOR INSTALLER ENABLEMENT | Default ON      |
| Category sales chart                | READY FOR INSTALLER ENABLEMENT | Default ON      |
| Top products                        | READY FOR INSTALLER ENABLEMENT | Default ON      |
| Export / advanced dashboard actions | NOT INSTALLER READY            | Hidden OFF      |

### Billing

| Feature                             | Readiness                      | Installer State              |
| ----------------------------------- | ------------------------------ | ---------------------------- |
| Core scan/cart/payment/receipt flow | READY FOR INSTALLER ENABLEMENT | Default ON                   |
| Reprint receipt                     | READY FOR INSTALLER ENABLEMENT | Default ON                   |
| Export receipt PDF                  | READY FOR INSTALLER ENABLEMENT | Default ON                   |
| WhatsApp receipt share              | NEEDS MINOR FIXES              | Optional ON after validation |
| Hold sale / resume held sale        | NEEDS MINOR FIXES              | Optional OFF initially       |
| Retail/wholesale mode               | NOT INSTALLER READY            | Hidden OFF                   |
| Split payment                       | NOT INSTALLER READY            | Hidden OFF                   |
| Return / exchange from Billing      | NOT INSTALLER READY            | Hidden OFF                   |
| Sync placeholder                    | NOT INSTALLER READY            | Hidden OFF                   |

### Products

| Feature                                | Readiness                      | Installer State        |
| -------------------------------------- | ------------------------------ | ---------------------- |
| List/search/filter/add/edit            | READY FOR INSTALLER ENABLEMENT | Default ON             |
| Product policy fields                  | READY FOR INSTALLER ENABLEMENT | Default ON             |
| Barcode printing                       | READY FOR INSTALLER ENABLEMENT | Default ON             |
| Catalog/category/brand/unit management | NEEDS MINOR FIXES              | Optional OFF initially |
| Import/export                          | NOT INSTALLER READY            | Hidden OFF             |

### Customers

| Feature                                     | Readiness                      | Installer State              |
| ------------------------------------------- | ------------------------------ | ---------------------------- |
| List/search/filter/add/edit/details         | READY FOR INSTALLER ENABLEMENT | Default ON                   |
| Ledger/payment views                        | READY FOR INSTALLER ENABLEMENT | Default ON                   |
| WhatsApp customer message                   | NEEDS MINOR FIXES              | Optional ON after validation |
| Delete inactive customers                   | NOT INSTALLER READY            | Hidden OFF                   |
| Groups/bulk/import/export/print placeholder | NOT INSTALLER READY            | Hidden OFF                   |

### Suppliers

| Feature                                   | Readiness           | Installer State                 |
| ----------------------------------------- | ------------------- | ------------------------------- |
| Core supplier list/search/add/edit        | NEEDS MINOR FIXES   | Optional OFF until smoke-tested |
| Supplier payments/ledger                  | NEEDS MINOR FIXES   | Optional OFF until smoke-tested |
| WhatsApp supplier message                 | NEEDS MINOR FIXES   | Optional ON after validation    |
| Statement/aging/print/export placeholders | NOT INSTALLER READY | Hidden OFF                      |

## 3. Default ON Features List

The following features are approved as installer Default ON candidates:

- Dashboard sales chart
- Dashboard payment methods chart
- Dashboard category sales chart
- Dashboard top products
- Billing core cashier flow
- Billing reprint receipt
- Billing export receipt PDF
- Products list/search/filter/add/edit
- Product policy visibility and persistence
- Product barcode printing
- Customers list/search/filter/add/edit/details
- Customer ledger/payment visibility where already stable

Default ON features must be stable, non-placeholder, non-destructive, and safe for the installer
baseline.

## 4. Optional Features List

The following features may be installer-toggleable or edition-toggleable after validation:

- Billing WhatsApp receipt share
- Billing hold sale / resume held sale
- Products catalog/category/brand/unit management
- Customers WhatsApp message
- Suppliers core management
- Supplier payment/ledger features
- Suppliers WhatsApp message

Optional features must not be silently enabled until validation passes. Validation must confirm UI
completeness, API completeness, data flow integrity, cross-module dependency safety, error handling,
and FeatureGate readiness.

## 5. Disabled Features List

The following features must remain disabled and hidden in installer builds until their workflows are
complete:

- Billing split payment
- Billing return from POS screen
- Billing exchange from POS screen
- Billing sync placeholder
- Billing retail/wholesale mode
- Dashboard export placeholder
- Product import/export
- Customer groups
- Customer bulk actions
- Customer import/export
- Customer print placeholder
- Customer delete inactive customers
- Supplier statement
- Supplier aging
- Supplier print/export placeholders
- Any placeholder action that does not complete a real workflow

Incomplete, placeholder, destructive, financial-risk, or external-dependency features must not be
default enabled.

## 6. Required Fix List Before Installer Build

Before preparing an installer build, the following work must be completed:

- Run full installer-mode smoke test for Dashboard, Billing, Products, Customers, and Suppliers.
- Confirm FeatureGate installer defaults: SAFE default ON, validated GUARDED optional, LOCKED
  hidden.
- Confirm no placeholder buttons are visible as active installer features.
- Validate all external communication wrappers, especially WhatsApp actions.
- Validate supplier workflows before enabling supplier features by default.
- Add explicit protection around destructive actions before exposing them.
- Keep split payment, import/export, sync, wholesale pricing, and POS return/exchange disabled until
  business models are complete.

## 7. Installer Release Recommendation

Ship with a strong CORE feature set enabled by default, expose low-risk optional utilities only
after validation, and keep all financial/destructive/placeholders hidden until workflows are
complete.

# Product Architecture Blueprint

## Purpose

Enterprise POS uses a simple v1 product model today:

- One product
- One SKU
- One barcode
- One display unit
- One stock quantity
- Optional batch information from purchases
- Purchase price
- Sale price

This is correct for the current v1 foundation. The long-term architecture must keep the default POS
experience simple while allowing advanced commercial models to be enabled later without rewriting
Billing, Inventory, Purchases, Returns, Sales History, Reports, Printing, or Barcode flows.

## Guiding Principle

Simple by Default, Powerful by Configuration.

General store, grocery, cosmetics, stationery, and super mart users should see a straightforward
product screen. Advanced product features must be available through explicit configuration, not
exposed by default.

Default feature state:

- Multi-Unit: Off
- Variations: Off
- Wholesale Pricing: Off
- Advanced Price Lists: Off
- Customer-Specific Pricing: Off
- Quantity Slabs: Off
- Promotions: Off
- Batch-Level Selling: Off
- Tax: Off where not required
- Advanced Costing: Off
- Multi-Branch Pricing: Off

## Standard Product Model

The standard product model is the default for:

- Grocery
- General store
- Super mart
- Cosmetics
- Stationery

Characteristics:

- Single SKU
- Single barcode
- Single display unit
- One stock quantity
- No variations
- No unit conversion
- Retail pricing only

In this mode, the product itself is the sellable item. Billing scans the product barcode, Inventory
tracks product-level stock, Purchases receive product-level stock, Returns reverse product-level
quantities, and Reports aggregate directly by product.

## Product Variations

Variations represent commercially distinct sellable versions of the same parent product.

Examples:

- Shampoo: 100ml, 200ml, 500ml
- Lays: BBQ, Masala, Yogurt
- T-Shirt: Red / Small, Blue / Medium
- Cosmetic item: Shade, finish, pack type

Each variant should be capable of having:

- Variant SKU
- Variant barcode
- Variant stock
- Variant purchase price
- Variant sale price
- Optional batch
- Optional expiry
- Optional unit conversion rules

Interaction by module:

- Products: parent product stores shared identity; variants store sellable options.
- Inventory: stock is tracked by product when variations are off, and by variant when variations are
  on.
- Billing: barcode lookup resolves variant first when variant barcodes exist.
- Purchases: purchase lines may receive stock against a variant.
- Purchase Orders: PO lines may order a variant.
- Returns: returns reverse the exact variant sold.
- Sales History: sale item snapshots must include product and variant identity.
- Reports: reports must support parent-level and variant-level aggregation.
- Barcode Scanning: lookup should resolve the most specific active barcode match.

## Multi-Unit Conversion

Multi-unit conversion should be enabled only for businesses that require true measurement or
packaging conversion.

Examples:

- Pharmacy: Box -> Strip -> Tablet
- Textile: Roll -> Meter
- Cable: Roll -> Meter
- Hardware: Bundle -> Piece

Required concepts:

- Base unit
- Purchase unit
- Sale unit
- Conversion factor
- Fraction allowed
- Barcode per unit
- Price per unit

Stock rule:

All stock must be stored in base units.

Example:

```text
Product: Panadol
Base Unit: Tablet
Purchase Unit: Box = 100 tablets
Sale Unit: Strip = 10 tablets
Sale Unit: Tablet = 1 tablet
Stored stock: 500 tablets
Displayed stock: 5 boxes, 50 strips, or 500 tablets depending on context
```

Billing, Purchases, Returns, Inventory, and Reports must convert quantities to base units for stock
movement and store display quantities as snapshots for audit.

## Packaging Strategy

Different package sizes are product variants, not unit conversions.

Example:

- Coca Cola 250ml
- Coca Cola 500ml
- Coca Cola 1L
- Coca Cola 1.5L

These are variants because each size is a separate commercial SKU with its own barcode, stock,
margin, supplier behavior, promotion behavior, and reportable sales performance. A user does not
sell half of a 1.5L bottle as a 750ml unit in a normal grocery workflow.

## Batch Strategy

Batch management is a stock lot layer, not a pricing engine.

Batch is responsible for:

- Batch number
- Purchase cost reference
- Expiry date
- Manufacturing date
- Quantity
- FIFO / FEFO logic

The future inventory lot model should support:

- Product
- Optional variant
- Warehouse
- Batch number
- Expiry date
- Cost
- Quantity stored in base units

Example:

```text
Product: Shampoo
Variant: 200ml
Batch A: 30 pieces, expiry January 2027
Batch B: 50 pieces, expiry March 2027
```

If batch-level selling is enabled, Billing should deduct from batches using FIFO or FEFO. If it is
disabled, batches remain purchase/inventory metadata and stock can continue to be displayed at
product or variant level.

## Barcode Strategy

Barcode ownership should be flexible.

Default:

- Product owns barcode.

Advanced:

- Variant can own barcode.
- Unit can own barcode.
- Batch can own barcode for regulated or expiry-sensitive workflows.

Recommended lookup priority:

```text
1. Batch barcode or serialized barcode
2. Unit barcode
3. Variant barcode
4. Product barcode
```

Trade-offs:

- Product barcode is simplest and fastest.
- Variant barcode is required for size, flavor, color, design, model, capacity, and pack type.
- Unit barcode is required for box, strip, tablet, roll, meter, bundle, and piece workflows.
- Batch barcode is powerful but operationally heavier and should remain optional.

## Pricing Strategy

Separate cost from selling price.

Pricing concepts:

- Purchase cost: cost captured from purchase or batch.
- Default product price: standard retail price.
- Wholesale price: optional secondary default price.
- Variant price: overrides product price for a variant.
- Unit price: overrides product or variant price for a sale unit.
- Promotional price: temporary rule-based price.
- Price list: customer, customer group, branch, or channel-specific price.

Sale items must snapshot the final applied price, discount, customer context, product, variant,
unit, and price source.

## Multi-Price Strategy

### Batch Management

Batch management handles stock identity:

- Batch number
- Purchase cost
- Expiry
- Manufacturing date
- Quantity
- FIFO / FEFO

Batch is not the pricing engine.

### Multi-Price System

The pricing system handles selling decisions:

- Retail price
- Wholesale price
- Customer group price
- Customer-specific price
- Quantity slab pricing
- Promotional pricing
- Future branch price

Recommended price layers:

- Default product price
- Variant price
- Unit price
- Batch cost reference
- Price lists
- Effective dates
- Priority rules
- Audit trail

Recommended priority order:

```text
1. Customer-specific active price
2. Active promotion
3. Customer group price
4. Quantity slab price
5. Unit price
6. Variant price
7. Product default price
```

Examples:

- Retail customer: default retail price.
- Wholesale customer: wholesale or wholesale price list.
- VIP customer: customer group price.
- Bulk purchase: quantity slab price.
- Expiring batch promotion: promotion applies to selected lot or product/variant.
- Future multi-branch pricing: branch price list overrides general price when enabled.

## Feature Flags

Advanced capabilities must be optional modules.

Feature flags should control:

- UI visibility
- validation rules
- preload/controller access
- reporting dimensions
- barcode lookup behavior
- migration readiness

Feature flags should support levels, not only on/off states. This keeps the general store experience
simple while allowing enterprise deployments to enable only the depth they need.

Recommended feature flag levels:

```text
Disabled
Basic
Advanced
```

Examples:

```text
Pricing:
  Disabled
  Retail Only
  Retail + Wholesale
  Advanced Price Lists

Units:
  Disabled
  Simple Display Unit
  Advanced Conversion

Tax:
  Disabled
  Basic Tax
  Advanced Tax Rules

Costing:
  Simple Cost
  FIFO
  Weighted Average later
  Specific Identification later
```

Recommended flags:

- product.variations
- product.multiUnit
- product.batchSelling
- pricing.wholesale
- pricing.priceLists
- pricing.customerSpecific
- pricing.quantitySlabs
- pricing.promotions
- tax.mode
- costing.method

Pending paid AI capabilities:

- AI product suggestions
- AI barcode/product enrichment
- AI purchase invoice parsing
- AI duplicate product detection
- AI stock reorder suggestions
- AI natural language reports
- AI anomaly detection
- AI customer behavior insights

These AI capabilities are deferred. They must remain disabled by default, require license
entitlement, and be protected in service and authorization layers before any UI exposure.

- inventory.multiWarehouse
- reporting.advancedProductDimensions
- branches.multiBranchPricing

## Tax System Strategy

Tax must be configurable and disabled by default where it is not required.

Recommended tax levels:

- Disabled: no tax UI, no tax calculations, and no tax fields shown in simple store workflows.
- Basic Tax: a simple percentage tax model for stores that only need one tax rule.
- Advanced Tax Rules: GST/VAT, inclusive/exclusive tax, zero-rated items, category-based tax,
  customer-based tax, and future branch/country tax rules.

Tax UI visibility rules:

- Billing should show tax controls only when tax is enabled.
- Products should show item tax configuration only when Basic or Advanced Tax is enabled.
- Purchases and Purchase Orders should show tax fields only when tax is enabled.
- Reports should show tax summaries only when tax is enabled.
- General Store mode should not display tax complexity unless the operator enables it.

Tax must remain separate from product identity, batch management, and pricing strategy. A price list
answers "what should this customer pay"; tax rules answer "what tax applies to this transaction."

## Inventory Costing Strategy

Inventory costing must be configurable.

Recommended costing levels:

- Simple Cost: last purchase cost or simple average cost suitable for v1 simple stores.
- FIFO: first-in-first-out costing when inventory lots are enabled.
- FEFO: first-expiry-first-out stock consumption when expiry/batch control is enabled.
- Weighted Average: later advanced costing option.
- Specific Identification: later advanced costing option for serialized or high-value goods.

Costing rules:

- Simple retail flow must not be affected by advanced costing options.
- FIFO/FEFO should only appear when batch or inventory lot tracking is enabled.
- Costing reports should appear only when costing mode requires them.
- Batch stores purchase cost references, but pricing remains controlled by the pricing system.
- Sales, returns, and stock movements must snapshot the costing method used for audit once advanced
  costing is enabled.

## UI Visibility Rule

Only enabled systems should appear in the UI.

General Store mode should remain simple:

- Product name
- SKU
- Barcode
- Display unit
- Purchase price
- Sale price
- Stock

Advanced features must not clutter Billing, Products, Inventory, Purchases, Purchase Orders,
Returns, or Reports unless enabled by configuration. Disabled features may exist in architecture,
but they should not create visible controls, required fields, confusing placeholders, or dead
buttons in the default workflow.

## Reporting Strategy

Reports must prevent double counting by separating reporting dimensions.

Recommended reporting dimensions:

- Parent product
- Variant
- Unit
- Batch
- Warehouse
- Price list
- Customer group
- Promotion

Rules:

- Parent product report aggregates all variants once.
- Variant report groups by variant identity.
- Unit report converts quantities to base units for stock and keeps sold unit snapshots for sales
  analysis.
- Batch report tracks lot movement and expiry.
- Price list report uses applied price source from sale item snapshots.
- Revenue reports use sale item totals, not current product prices.
- Stock reports use inventory balances/lots, not sale history.

## Migration Strategy

Migration from today's architecture should be incremental.

Current model:

```text
products
inventory
purchase_items
sale_items
return_items
purchase_order_items
```

Future-safe migration path:

1. Keep current product fields as the default simple model.
2. Add feature flags with all advanced product features off.
3. Add optional variant identity without forcing existing products to change.
4. Add optional product unit conversion tables.
5. Add optional barcode mapping table.
6. Add optional inventory lot table for batch-aware stock.
7. Update Billing lookup to resolve barcode mapping while preserving current product lookup.
8. Update Inventory, Purchases, Purchase Orders, Returns, and Reports one module at a time.
9. Add advanced price list engine after stock identity is stable.

Affected modules:

- Products
- Inventory
- Billing
- Sales History
- Returns
- Purchases
- Purchase Orders
- Reports
- Printing
- Barcode

## Database Entity Proposal

Future entities:

```text
products
product_variants
units
product_unit_conversions
product_barcodes
inventory_balances
inventory_lots
stock_movements
price_lists
price_list_items
promotions
promotion_items
sale_items
purchase_items
purchase_order_items
return_items
price_audit_log
```

Textual relationship diagram:

```text
products
  ├─ product_variants
  │    ├─ product_barcodes
  │    ├─ inventory_balances
  │    ├─ inventory_lots
  │    ├─ sale_items
  │    ├─ purchase_items
  │    ├─ purchase_order_items
  │    └─ return_items
  │
  ├─ product_unit_conversions
  │    └─ units
  │
  ├─ product_barcodes
  ├─ inventory_balances
  ├─ inventory_lots
  ├─ sale_items
  ├─ purchase_items
  ├─ purchase_order_items
  └─ return_items

price_lists
  └─ price_list_items

promotions
  └─ promotion_items
```

## Implementation Order

1. Lock the simple product model for v1.
2. Stabilize current modules using product-level stock and price.
3. Add documentation and feature flag definitions.
4. Add product identity abstraction: product plus optional variant.
5. Add feature flag levels for products, units, pricing, tax, and costing.
6. Add variant backend and UI behind a feature flag.
7. Add barcode mapping behind a feature flag.
8. Add unit conversion backend and UI behind a feature flag.
9. Add batch lot inventory and FIFO/FEFO behind a feature flag.
10. Add basic and advanced tax configuration behind feature flags.
11. Add advanced price list engine.
12. Add reporting dimensions for variants, units, batches, tax, costing, and price lists.

## Before v1.0

Implement before v1.0:

- Stable simple product model.
- Reliable product/category/brand/unit filters.
- Reliable Inventory stock values.
- Billing stock guards.
- Purchases stock/cost updates.
- Returns stock reversal.
- Sales History invoice snapshots.
- Reports that do not assume variants or unit conversion.
- Documented feature flags for future advanced product architecture.
- Documented tax and costing strategy with UI disabled by default for simple stores.

Do not implement advanced product schema casually before v1.0.

## After v1.0

Implement after v1.0:

- Product variations.
- Multi-unit conversion.
- Batch-level selling.
- FIFO / FEFO enforcement.
- Advanced price lists.
- Customer-specific pricing.
- Quantity slab pricing.
- Promotions.
- Advanced tax rules.
- FIFO/FEFO costing UI and reports.
- Weighted average costing.
- Specific identification costing.
- Branch pricing.
- Variant, unit, batch, and price-list reporting.

## Commercial Risks If Delayed

Delaying advanced product architecture is acceptable for general store and mart workflows.

Risks for advanced businesses:

- Pharmacy requires unit conversion and expiry control.
- Textile and cable businesses require fractional unit sales.
- Fashion and cosmetics require variants.
- Wholesale customers require price lists and customer group pricing.
- Multi-branch operations require branch-specific stock and pricing.

Main workaround risk:

Users may create duplicate products for sizes, units, or variants. This fragments stock, reports,
barcodes, purchase history, return tracking, and margin analysis.

## Performance Considerations

Use fast lookup and balance tables:

- Barcode mapping table for scanning.
- Inventory balances for current stock.
- Inventory lots for batch stock.
- Stock movements for audit.
- Sale item snapshots for reporting.
- Indexed price list lookups.

Avoid calculating live stock from full movement history during normal screen loads.

Recommended performance rules:

- Billing barcode lookup must be indexed and deterministic.
- Inventory list must read balances, not compute from movements.
- Reports must aggregate snapshots, not mutable current product prices.
- Price resolution should be cached per sale session where safe.
- Feature-flag-disabled dimensions should not slow down simple product users.

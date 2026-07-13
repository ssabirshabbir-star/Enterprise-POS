const assert = require('node:assert/strict');
const test = require('node:test');

const {
  FIELD_DEFINITIONS,
  HEADER_ALIASES,
  IMPORT_LIMITS,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
  canonicalizeHeader,
  generateInventoryImportTemplateCsv,
} = require('../../src/main/features/inventory/inventory-import-template.contract');

test('Inventory import template exposes the exact canonical v1 header order', () => {
  assert.equal(TEMPLATE_VERSION, 'inventory-import-v1');
  assert.deepEqual(TEMPLATE_HEADERS, [
    'Product Name',
    'SKU',
    'Barcode',
    'Category',
    'Brand',
    'Unit',
    'Variant',
    'Cost Price',
    'Selling Price',
    'Wholesale Price',
    'Opening Quantity',
    'Minimum Stock',
    'Active',
    'Track Expiry',
    'Expiry Required',
    'Expiry Alert Days',
    'Allow Price Change',
    'Remarks',
  ]);
});

test('Inventory import template CSV is header-only, BOM-prefixed, and CRLF terminated', () => {
  const csv = generateInventoryImportTemplateCsv();
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv, `\uFEFF${TEMPLATE_HEADERS.join(',')}\r\n`);
  assert.equal(
    csv
      .trimEnd()
      .replace(/^\uFEFF/, '')
      .split(/\r\n/).length,
    1
  );
});

test('Inventory import template excludes unsupported v1 fields', () => {
  const headers = TEMPLATE_HEADERS.join('|');
  assert.doesNotMatch(headers, /Batch Number/);
  assert.doesNotMatch(headers, /Expiration Date/);
  assert.doesNotMatch(headers, /Warehouse/);
  assert.doesNotMatch(headers, /Item Location/);
  assert.doesNotMatch(headers, /Allow Price Override/);
  assert.match(headers, /Allow Price Change/);
});

test('Inventory import template field definitions reflect schema limits and scope', () => {
  assert.equal(FIELD_DEFINITIONS.productName.maxLength, 220);
  assert.equal(FIELD_DEFINITIONS.sku.maxLength, 80);
  assert.equal(FIELD_DEFINITIONS.barcode.maxLength, 120);
  assert.equal(FIELD_DEFINITIONS.costPrice.maxDecimals, 2);
  assert.equal(FIELD_DEFINITIONS.openingQuantity.maxDecimals, 3);
  assert.equal(FIELD_DEFINITIONS.allowPriceChange.defaultValue, false);
  assert.equal(IMPORT_LIMITS.maxRows, 10000);
  assert.equal(IMPORT_LIMITS.maxFileBytes, 10 * 1024 * 1024);
});

test('Inventory import template allows only minimal approved aliases', () => {
  assert.equal(canonicalizeHeader(' Cost '), 'Cost Price');
  assert.equal(canonicalizeHeader('Sale Price'), 'Selling Price');
  assert.equal(canonicalizeHeader('qty'), 'Opening Quantity');
  assert.equal(canonicalizeHeader('Product Name'), 'Product Name');
  assert.equal(canonicalizeHeader('Product'), null);
  assert.deepEqual(Object.keys(HEADER_ALIASES).sort(), ['cost', 'qty', 'sale price']);
});

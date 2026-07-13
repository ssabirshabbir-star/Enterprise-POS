const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  parseInventoryImportCsv,
} = require('../../src/main/features/inventory/inventory-import-csv.parser');
const {
  TEMPLATE_HEADERS,
} = require('../../src/main/features/inventory/inventory-import-template.contract');
const { IMPORT_ERROR_CODES } = require('../../src/main/features/inventory/inventory-import.errors');
const {
  ROW_STATUSES,
  validateInventoryImportRows,
} = require('../../src/main/features/inventory/inventory-import.validation');

const root = path.join(__dirname, '..', '..');

function line(values = {}) {
  return TEMPLATE_HEADERS.map((header) => values[header] ?? '').join(',');
}

function validateLines(lines) {
  const parsed = parseInventoryImportCsv(
    `${TEMPLATE_HEADERS.join(',')}\r\n${lines.join('\r\n')}\r\n`
  );
  assert.equal(parsed.ok, true);
  return validateInventoryImportRows(parsed.sourceRows);
}

test('Inventory import validation preserves SKU and Barcode leading zeros as text', () => {
  const result = validateLines([
    line({
      'Product Name': 'Flour',
      SKU: '000123',
      Barcode: '0000009876',
      'Cost Price': '10',
      'Selling Price': '12',
    }),
  ]);
  assert.equal(result.rows[0].normalized.sku, '000123');
  assert.equal(result.rows[0].normalized.barcode, '0000009876');
  assert.equal(typeof result.rows[0].normalized.sku, 'string');
});

test('Inventory import validation rejects scientific notation identifiers and invalid identifier characters', () => {
  const result = validateLines([line({ SKU: '1E10', Barcode: '=FORMULA' })]);
  assert(result.errors.some((error) => error.code === IMPORT_ERROR_CODES.SCIENTIFIC_NOTATION));
  assert(result.errors.some((error) => error.code === IMPORT_ERROR_CODES.INVALID_BARCODE));
});

test('Inventory import validation accepts plain decimals and rejects separators, currency, negatives, and precision overflow', () => {
  const good = validateLines([
    line({
      SKU: 'SKU-1',
      'Cost Price': '10.50',
      'Selling Price': '12.99',
      'Opening Quantity': '1.125',
    }),
  ]);
  assert.equal(good.ok, true);
  assert.equal(good.rows[0].normalized.costPrice, '10.50');
  assert.equal(good.rows[0].normalized.sellingPrice, '12.99');
  assert.equal(good.rows[0].normalized.openingQuantity, '1.125');
  assert.equal(typeof good.rows[0].normalized.costPrice, 'string');

  const bad = validateLines([
    line({ SKU: 'SKU-2', 'Cost Price': '"1,000"' }),
    line({ SKU: 'SKU-3', 'Cost Price': 'Rs.10' }),
    line({ SKU: 'SKU-4', 'Cost Price': '-1' }),
    line({ SKU: 'SKU-5', 'Cost Price': '1.999' }),
    line({ SKU: 'SKU-6', 'Opening Quantity': '1.1234' }),
    line({ SKU: 'SKU-7', 'Cost Price': 'NaN' }),
    line({ SKU: 'SKU-8', 'Cost Price': 'Infinity' }),
  ]);
  assert(bad.errors.some((error) => error.code === IMPORT_ERROR_CODES.INVALID_NUMBER));
  assert(bad.errors.some((error) => error.code === IMPORT_ERROR_CODES.NEGATIVE_NUMBER));
  assert(bad.errors.some((error) => error.code === IMPORT_ERROR_CODES.TOO_MANY_DECIMALS));
});

test('Inventory import validation canonicalizes decimal strings and enforces price boundaries', () => {
  const valid = validateLines([
    line({ SKU: 'SKU-1', 'Cost Price': '0', 'Selling Price': '0.00' }),
    line({ SKU: 'SKU-2', 'Cost Price': '1', 'Selling Price': '1.2' }),
    line({ SKU: 'SKU-3', 'Cost Price': '0001.20', 'Selling Price': '999999999999.99' }),
    line({ SKU: 'SKU-4', 'Cost Price': '.5', 'Selling Price': '5.' }),
  ]);
  assert.equal(valid.ok, true);
  assert.equal(valid.rows[0].normalized.costPrice, '0');
  assert.equal(valid.rows[0].normalized.sellingPrice, '0.00');
  assert.equal(valid.rows[2].normalized.costPrice, '1.20');
  assert.equal(valid.rows[3].normalized.costPrice, '0.5');
  assert.equal(valid.rows[3].normalized.sellingPrice, '5');

  const invalid = validateLines([
    line({ SKU: 'SKU-5', 'Cost Price': '-0' }),
    line({ SKU: 'SKU-6', 'Cost Price': '-0.00' }),
    line({ SKU: 'SKU-7', 'Cost Price': '+1' }),
    line({ SKU: 'SKU-8', 'Cost Price': '9999999999999' }),
    line({ SKU: 'SKU-9', 'Cost Price': '1000000000000.00' }),
    line({ SKU: 'SKU-10', 'Cost Price': '999999999999.999' }),
    line({ SKU: 'SKU-11', 'Cost Price': '123456789012345678901234567890' }),
  ]);
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.NEGATIVE_NUMBER));
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.INVALID_NUMBER));
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.NUMBER_OUT_OF_RANGE));
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.TOO_MANY_DECIMALS));
});

test('Inventory import validation enforces quantity and expiry alert day boundaries', () => {
  const valid = validateLines([
    line({
      SKU: 'SKU-1',
      'Cost Price': '1',
      'Opening Quantity': '0.001',
      'Minimum Stock': '99999999999.999',
      'Expiry Alert Days': '0',
    }),
    line({
      SKU: 'SKU-2',
      'Cost Price': '1',
      'Opening Quantity': '1.250',
      'Minimum Stock': '000.500',
      'Expiry Alert Days': '365',
    }),
  ]);
  assert.equal(valid.ok, true);
  assert.equal(valid.rows[0].normalized.openingQuantity, '0.001');
  assert.equal(valid.rows[0].normalized.minimumStock, '99999999999.999');
  assert.equal(valid.rows[1].normalized.minimumStock, '0.500');
  assert.equal(valid.rows[1].normalized.expiryAlertDays, '365');

  const invalid = validateLines([
    line({ SKU: 'SKU-3', 'Cost Price': '1', 'Opening Quantity': '-0' }),
    line({ SKU: 'SKU-4', 'Cost Price': '1', 'Opening Quantity': '-0.001' }),
    line({ SKU: 'SKU-5', 'Cost Price': '1', 'Opening Quantity': '1.0001' }),
    line({ SKU: 'SKU-6', 'Cost Price': '1', 'Opening Quantity': '100000000000' }),
    line({ SKU: 'SKU-7', 'Minimum Stock': '99999999999.9999' }),
    line({ SKU: 'SKU-8', 'Opening Quantity': '1e3' }),
    line({ SKU: 'SKU-9', 'Expiry Alert Days': '1.5' }),
    line({ SKU: 'SKU-10', 'Expiry Alert Days': '-1' }),
    line({ SKU: 'SKU-11', 'Expiry Alert Days': '100000' }),
  ]);
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.NEGATIVE_NUMBER));
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.TOO_MANY_DECIMALS));
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.NUMBER_OUT_OF_RANGE));
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.SCIENTIFIC_NOTATION));
  assert(invalid.errors.some((error) => error.code === IMPORT_ERROR_CODES.INVALID_NUMBER));
});

test('Inventory import validation parses allowed booleans and rejects ambiguous values', () => {
  const good = validateLines([
    line({
      SKU: 'SKU-1',
      Active: 'active',
      'Track Expiry': 'yes',
      'Expiry Required': 'true',
      'Allow Price Change': '1',
    }),
    line({
      SKU: 'SKU-2',
      Active: 'inactive',
      'Track Expiry': '0',
      'Expiry Required': 'false',
      'Allow Price Change': 'no',
    }),
  ]);
  assert.equal(good.rows[0].normalized.active, true);
  assert.equal(good.rows[1].normalized.active, false);

  const bad = validateLines([line({ SKU: 'SKU-3', 'Track Expiry': 'active' })]);
  assert(bad.errors.some((error) => error.code === IMPORT_ERROR_CODES.INVALID_BOOLEAN));
});

test('Inventory import validation enforces expiry policy conflict', () => {
  const result = validateLines([
    line({ SKU: 'SKU-1', 'Track Expiry': 'false', 'Expiry Required': 'true' }),
  ]);
  assert(result.errors.some((error) => error.code === IMPORT_ERROR_CODES.EXPIRY_POLICY_CONFLICT));
});

test('Inventory import validation classifies candidates without database claims', () => {
  const result = validateLines([
    line({
      'Product Name': 'Flour',
      SKU: 'SKU-1',
      'Cost Price': '10',
      'Selling Price': '12',
      'Opening Quantity': '0',
    }),
    line({ SKU: 'SKU-2', 'Cost Price': '10', 'Opening Quantity': '5' }),
    line({ SKU: 'SKU-3', 'Opening Quantity': '0' }),
  ]);
  assert.equal(result.rows[0].status, ROW_STATUSES.PRODUCT_ONLY_CANDIDATE);
  assert.equal(result.rows[1].status, ROW_STATUSES.STOCK_ROW_CANDIDATE);
  assert.equal(result.rows[2].status, ROW_STATUSES.STRUCTURALLY_VALID);
  assert.equal(result.rows[0].warnings.length, 0);
  assert.doesNotMatch(JSON.stringify(result.rows), /VALID_NEW_PRODUCT|VALID_EXISTING_PRODUCT/);
});

test('Inventory import validation enforces required fields for product and stock candidates', () => {
  const result = validateLines([
    line({ 'Product Name': 'Flour', SKU: 'SKU-1', 'Cost Price': '10' }),
    line({ Barcode: '123456', 'Opening Quantity': '5' }),
    line({ SKU: 'SKU-2', 'Opening Quantity': '5', 'Cost Price': '0' }),
  ]);
  assert(
    result.errors.some(
      (error) =>
        error.code === IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD && error.column === 'Selling Price'
    )
  );
  assert(
    result.errors.some(
      (error) =>
        error.code === IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD && error.column === 'Cost Price'
    )
  );
  assert(result.errors.some((error) => error.code === IMPORT_ERROR_CODES.ZERO_COST_WITH_STOCK));
});

test('Inventory import validation detects duplicate SKU and Barcode within the file', () => {
  const result = validateLines([
    line({ SKU: 'Dup-1', Barcode: '1111' }),
    line({ SKU: 'dup-1', Barcode: '2222' }),
    line({ SKU: 'Unique-1', Barcode: '1111' }),
  ]);
  assert(result.errors.some((error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_SKU_IN_FILE));
  assert(
    result.errors.some((error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_BARCODE_IN_FILE)
  );
  assert(result.rows.some((row) => row.status === ROW_STATUSES.DUPLICATE_IN_FILE));
});

test('Inventory import validation keeps structurally invalid status when duplicate errors also apply', () => {
  const result = validateLines([
    line({ SKU: 'DUP-1', Barcode: '1111', 'Cost Price': '10', 'Opening Quantity': '1' }),
    line({ SKU: 'dup-1', Barcode: '2222', 'Cost Price': '1.234' }),
    line({ SKU: 'DUP-2', Barcode: '3333' }),
    line({ SKU: 'dup-2', Barcode: '3333', 'Cost Price': '-1' }),
    line({ SKU: 'dup-2', Barcode: '3333' }),
  ]);
  const skuDuplicate = result.rows[1];
  const invalidDoubleDuplicate = result.rows[3];
  const validDoubleDuplicate = result.rows[4];

  assert.equal(skuDuplicate.status, ROW_STATUSES.STRUCTURALLY_INVALID);
  assert(skuDuplicate.errors.some((error) => error.code === IMPORT_ERROR_CODES.TOO_MANY_DECIMALS));
  assert(
    skuDuplicate.errors.some(
      (error) =>
        error.code === IMPORT_ERROR_CODES.DUPLICATE_SKU_IN_FILE && error.referenceRowNumber === 2
    )
  );
  assert.equal(invalidDoubleDuplicate.status, ROW_STATUSES.STRUCTURALLY_INVALID);
  assert(
    invalidDoubleDuplicate.errors.some((error) => error.code === IMPORT_ERROR_CODES.NEGATIVE_NUMBER)
  );
  assert(
    invalidDoubleDuplicate.errors.some(
      (error) =>
        error.code === IMPORT_ERROR_CODES.DUPLICATE_SKU_IN_FILE && error.referenceRowNumber === 4
    )
  );
  assert(
    invalidDoubleDuplicate.errors.some(
      (error) =>
        error.code === IMPORT_ERROR_CODES.DUPLICATE_BARCODE_IN_FILE &&
        error.referenceRowNumber === 4
    )
  );
  assert.equal(validDoubleDuplicate.status, ROW_STATUSES.DUPLICATE_IN_FILE);
  assert(
    validDoubleDuplicate.errors.some(
      (error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_SKU_IN_FILE
    )
  );
  assert(
    validDoubleDuplicate.errors.some(
      (error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_BARCODE_IN_FILE
    )
  );
});

test('Inventory import validation handles empty rows and text length limits safely', () => {
  const result = validateLines([
    line(),
    line({ SKU: 'A'.repeat(81) }),
    line({ Remarks: 'R'.repeat(501), SKU: 'SKU-1' }),
  ]);
  assert.equal(result.rows[0].status, ROW_STATUSES.EMPTY_ROW);
  assert(result.errors.some((error) => error.code === IMPORT_ERROR_CODES.TEXT_TOO_LONG));
});

test('Inventory import validation rejects formula-like numeric input but keeps formula-like remarks inert text', () => {
  const result = validateLines([
    line({ SKU: 'SKU-1', 'Cost Price': '=10', Remarks: '=do-not-execute' }),
  ]);
  assert(result.errors.some((error) => error.code === IMPORT_ERROR_CODES.INVALID_NUMBER));
  assert.equal(result.rows[0].normalized.remarks, '=do-not-execute');
});

test('Inventory import foundation has no fs, Electron, database, UI, or IPC dependency', () => {
  [
    'src/main/features/inventory/inventory-import-template.contract.js',
    'src/main/features/inventory/inventory-import-csv.parser.js',
    'src/main/features/inventory/inventory-import.validation.js',
    'src/main/features/inventory/inventory-import.errors.js',
  ].forEach((relative) => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(
      source,
      /require\(['"](?:fs|electron|pg)|getPool|ipcMain|ipcRenderer|document\./
    );
  });
});

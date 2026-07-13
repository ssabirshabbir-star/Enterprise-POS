const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  parseInventoryImportCsv,
} = require('../../src/main/features/inventory/inventory-import-csv.parser');
const {
  TEMPLATE_HEADERS,
  generateInventoryImportTemplateCsv,
} = require('../../src/main/features/inventory/inventory-import-template.contract');
const { IMPORT_ERROR_CODES } = require('../../src/main/features/inventory/inventory-import.errors');

const parserPath = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'main',
  'features',
  'inventory',
  'inventory-import-csv.parser.js'
);

function csvWithRows(rows, lineEnding = '\r\n') {
  return `${TEMPLATE_HEADERS.join(',')}${lineEnding}${rows.join(lineEnding)}${lineEnding}`;
}

function row(values = {}) {
  return TEMPLATE_HEADERS.map((header) => values[header] ?? '').join(',');
}

test('Inventory import CSV parser parses simple valid CSV', () => {
  const result = parseInventoryImportCsv(
    csvWithRows([
      row({ 'Product Name': 'Flour', SKU: 'SKU-1', 'Cost Price': '10', 'Selling Price': '12' }),
    ])
  );
  assert.equal(result.ok, true);
  assert.equal(result.sourceRows.length, 1);
  assert.equal(result.sourceRows[0].cells.productName, 'Flour');
});

test('Inventory import CSV parser accepts UTF-8 BOM, CRLF, and LF', () => {
  const crlf = parseInventoryImportCsv(`\uFEFF${csvWithRows([row({ SKU: 'A-1' })])}`);
  const lf = parseInventoryImportCsv(csvWithRows([row({ SKU: 'A-2' })], '\n'));
  assert.equal(crlf.ok, true);
  assert.equal(lf.ok, true);
});

test('Inventory import CSV parser handles quoted commas, escaped quotes, multiline fields, and empty cells', () => {
  const csv = csvWithRows([
    row({
      'Product Name': '"Oil, ""Premium"""',
      SKU: 'OIL-1',
      Remarks: '"Line 1\r\nLine 2"',
    }),
  ]);
  const result = parseInventoryImportCsv(csv);
  assert.equal(result.ok, true);
  assert.equal(result.sourceRows[0].cells.productName, 'Oil, "Premium"');
  assert.equal(result.sourceRows[0].cells.remarks, 'Line 1\r\nLine 2');
  assert.equal(result.sourceRows[0].cells.barcode, '');
});

test('Inventory import CSV parser ignores blank trailing rows', () => {
  const result = parseInventoryImportCsv(`${csvWithRows([row({ SKU: 'SKU-1' })])}\r\n\r\n`);
  assert.equal(result.ok, true);
  assert.equal(result.sourceRows.length, 1);
});

test('Inventory import CSV parser rejects malformed unmatched quotes', () => {
  const result = parseInventoryImportCsv(csvWithRows([row({ 'Product Name': '"Broken' })]));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, IMPORT_ERROR_CODES.UNMATCHED_QUOTE);
});

test('Inventory import CSV parser rejects column count mismatch', () => {
  const result = parseInventoryImportCsv(`${TEMPLATE_HEADERS.join(',')}\r\none,two\r\n`);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, IMPORT_ERROR_CODES.COLUMN_COUNT_MISMATCH);
});

test('Inventory import CSV parser rejects duplicate, unknown, and missing headers', () => {
  const duplicate = parseInventoryImportCsv(`SKU,SKU\r\nA,B\r\n`);
  const unknown = parseInventoryImportCsv(`${TEMPLATE_HEADERS.join(',')},Extra\r\n${row()},x\r\n`);
  const missing = parseInventoryImportCsv(`Product Name,SKU\r\nFlour,FLOUR-1\r\n`);
  assert.equal(duplicate.ok, false);
  assert(duplicate.errors.some((error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_HEADER));
  assert.equal(unknown.ok, false);
  assert(unknown.errors.some((error) => error.code === IMPORT_ERROR_CODES.UNKNOWN_HEADER));
  assert.equal(missing.ok, false);
  assert(missing.errors.some((error) => error.code === IMPORT_ERROR_CODES.MISSING_HEADER));
});

test('Inventory import CSV parser rejects alias collisions deterministically', () => {
  const withHeader = (headers) =>
    parseInventoryImportCsv(`${headers.join(',')}\r\n${headers.map(() => '').join(',')}\r\n`);
  const costCollision = withHeader(
    TEMPLATE_HEADERS.map((header) => (header === 'Cost Price' ? 'Cost' : header))
  );
  const duplicateCostCollision = withHeader([...TEMPLATE_HEADERS, 'Cost']);
  const saleCollision = withHeader(
    TEMPLATE_HEADERS.map((header) => (header === 'Selling Price' ? 'Sale Price' : header))
  );
  const duplicateSaleCollision = withHeader([...TEMPLATE_HEADERS, ' sale price ']);
  const qtyCollision = withHeader(
    TEMPLATE_HEADERS.map((header) => (header === 'Opening Quantity' ? 'Qty' : header))
  );
  const duplicateQtyCollision = withHeader([...TEMPLATE_HEADERS, 'QTY']);

  assert.equal(costCollision.ok, true);
  assert.equal(saleCollision.ok, true);
  assert.equal(qtyCollision.ok, true);
  assert.equal(duplicateCostCollision.ok, false);
  assert(
    duplicateCostCollision.errors.some(
      (error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_HEADER
    )
  );
  assert.equal(duplicateSaleCollision.ok, false);
  assert(
    duplicateSaleCollision.errors.some(
      (error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_HEADER
    )
  );
  assert.equal(duplicateQtyCollision.ok, false);
  assert(
    duplicateQtyCollision.errors.some((error) => error.code === IMPORT_ERROR_CODES.DUPLICATE_HEADER)
  );
});

test('Inventory import CSV parser rejects NUL, binary controls, empty file, row limit, and size limit', () => {
  assert.equal(parseInventoryImportCsv('\u0000').errors[0].code, IMPORT_ERROR_CODES.NUL_BYTE);
  assert.equal(
    parseInventoryImportCsv('abc\u0001').errors[0].code,
    IMPORT_ERROR_CODES.BINARY_CONTENT
  );
  assert.equal(parseInventoryImportCsv('').errors[0].code, IMPORT_ERROR_CODES.EMPTY_FILE);
  assert.equal(
    parseInventoryImportCsv(csvWithRows([row({ SKU: 'A-1' }), row({ SKU: 'A-2' })]), {
      limits: { maxRows: 1 },
    }).errors[0].code,
    IMPORT_ERROR_CODES.TOO_MANY_ROWS
  );
  assert.equal(
    parseInventoryImportCsv(generateInventoryImportTemplateCsv(), { limits: { maxFileBytes: 4 } })
      .errors[0].code,
    IMPORT_ERROR_CODES.FILE_TOO_LARGE
  );
});

test('Inventory import CSV parser uses strict UTF-8 decoding for byte input', () => {
  const valid = parseInventoryImportCsv(
    Buffer.from(csvWithRows([row({ 'Product Name': 'صابن', SKU: 'SKU-اردو' })]), 'utf8')
  );
  const bom = parseInventoryImportCsv(
    Buffer.from(`\uFEFF${csvWithRows([row({ SKU: 'SKU-1' })])}`, 'utf8')
  );
  const uint8 = parseInventoryImportCsv(
    new Uint8Array(Buffer.from(csvWithRows([row({ SKU: 'SKU-2' })]), 'utf8'))
  );

  assert.equal(valid.ok, true);
  assert.equal(valid.sourceRows[0].cells.productName, 'صابن');
  assert.equal(bom.ok, true);
  assert.equal(uint8.ok, true);
  [
    Buffer.from([0xc3, 0x28]),
    Buffer.from([0x80]),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xe2, 0x82]),
  ].forEach((input) => {
    const result = parseInventoryImportCsv(input);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, IMPORT_ERROR_CODES.INVALID_UTF8);
  });
});

test('Inventory import CSV parser rejects invalid quote positions and delimiter mismatches', () => {
  const quoteAfterContent = parseInventoryImportCsv(
    `${TEMPLATE_HEADERS.join(',')}\r\nabc"def,${TEMPLATE_HEADERS.slice(1)
      .map(() => '')
      .join(',')}\r\n`
  );
  const textAfterClosingQuote = parseInventoryImportCsv(
    `${TEMPLATE_HEADERS.join(',')}\r\n"abc"x,${TEMPLATE_HEADERS.slice(1)
      .map(() => '')
      .join(',')}\r\n`
  );
  const semicolon = parseInventoryImportCsv(
    `${TEMPLATE_HEADERS.join(';')}\r\n${TEMPLATE_HEADERS.map(() => '').join(';')}\r\n`
  );
  const tab = parseInventoryImportCsv(
    `${TEMPLATE_HEADERS.join('\t')}\r\n${TEMPLATE_HEADERS.map(() => '').join('\t')}\r\n`
  );

  assert.equal(quoteAfterContent.ok, false);
  assert.equal(quoteAfterContent.errors[0].code, IMPORT_ERROR_CODES.MALFORMED_CSV);
  assert.equal(textAfterClosingQuote.ok, false);
  assert.equal(textAfterClosingQuote.errors[0].code, IMPORT_ERROR_CODES.MALFORMED_CSV);
  assert.equal(semicolon.ok, false);
  assert(semicolon.errors.some((error) => error.code === IMPORT_ERROR_CODES.UNKNOWN_HEADER));
  assert.equal(tab.ok, false);
  assert(tab.errors.some((error) => error.code === IMPORT_ERROR_CODES.UNKNOWN_HEADER));
});

test('Inventory import CSV parser preserves Unicode and Urdu text', () => {
  const result = parseInventoryImportCsv(
    csvWithRows([row({ 'Product Name': 'صابن', SKU: 'SKU-اردو' })])
  );
  assert.equal(result.ok, true);
  assert.equal(result.sourceRows[0].cells.productName, 'صابن');
});

test('Inventory import CSV parser is a state machine, not String.split comma parsing', () => {
  const source = fs.readFileSync(parserPath, 'utf8');
  assert.doesNotMatch(source, /\.split\(['"`],['"`]\)/);
});

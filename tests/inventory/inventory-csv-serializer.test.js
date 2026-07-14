const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CSV_COLUMNS,
  serializeInventoryRowsToCsv,
} = require('../../src/main/features/inventory/inventory-csv.serializer');

function bodyLines(csv) {
  return csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
}

test('Inventory CSV serializer emits a stable BOM-prefixed header', () => {
  const csv = serializeInventoryRowsToCsv([]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(
    bodyLines(csv)[0],
    CSV_COLUMNS.map((column) => column.header).join(',')
  );
  assert.equal(bodyLines(csv).length, 1);
});

test('Inventory CSV serializer formats ordinary inventory values deterministically', () => {
  const csv = serializeInventoryRowsToCsv([
    {
      name: 'Bubble Gum',
      sku: 'BG-01',
      barcode: '12345',
      categoryName: 'Personal Care',
      brandName: 'Local',
      unitName: 'Piece',
      batchNumber: 'B-100',
      expirationDate: '2026-07-13T09:30:00.000Z',
      lastPurchasePrice: 10.5,
      purchasePrice: 9,
      salePrice: 12,
      currentStock: 25,
      minStockLevel: 5,
      status: 'IN_STOCK',
      isActive: true,
    },
  ]);

  assert.equal(
    bodyLines(csv)[1],
    'Bubble Gum,BG-01,12345,Personal Care,Local,Piece,B-100,2026-07-13,10.5,9,12,25,5,In Stock,Active'
  );
});

test('Inventory CSV serializer escapes commas, quotes, multiline values, nulls, and undefined', () => {
  const csv = serializeInventoryRowsToCsv([
    {
      name: 'Oil, "Premium"',
      sku: null,
      barcode: undefined,
      categoryName: 'Line\r\nBreak',
      brandName: 'Brand',
      unitName: 'Bottle',
      batchNumber: 'Batch "A"',
      expirationDate: null,
      lastPurchasePrice: null,
      purchasePrice: undefined,
      salePrice: 100,
      currentStock: 0,
      minStockLevel: 1,
      status: 'OUT_OF_STOCK',
      isActive: false,
    },
  ]);

  assert.match(
    csv,
    /"Oil, ""Premium""",,,"Line\r\nBreak",Brand,Bottle,"Batch ""A""",,,,100,0,1,Out of Stock,Inactive/
  );
});

test('Inventory CSV serializer preserves Urdu and Unicode text', () => {
  const csv = serializeInventoryRowsToCsv([{ name: 'صابن', sku: 'یونٹ-١', status: 'LOW_STOCK' }]);
  assert.match(csv, /صابن/);
  assert.match(csv, /یونٹ-١/);
  assert.match(csv, /Low Stock/);
});

test('Inventory CSV serializer protects textual formula-like values', () => {
  const csv = serializeInventoryRowsToCsv([
    {
      name: '=CMD',
      sku: '+SUM(A1:A2)',
      barcode: '-10-text',
      categoryName: '@Risk',
      brandName: '  =after-space',
      unitName: 'Piece',
      batchNumber: '-BATCH',
      status: 'IN_STOCK',
      isActive: true,
    },
  ]);

  assert.equal(
    bodyLines(csv)[1],
    "'=CMD,'+SUM(A1:A2),'-10-text,'@Risk,\"'  =after-space\",Piece,'-BATCH,,,,,,,In Stock,Active"
  );
});

test('Inventory CSV serializer keeps legitimate negative numeric values numeric', () => {
  const csv = serializeInventoryRowsToCsv([
    {
      name: 'Correction Product',
      lastPurchasePrice: -5,
      purchasePrice: -4.5,
      salePrice: -3,
      currentStock: -1,
      minStockLevel: -2,
      status: 'OUT_OF_STOCK',
    },
  ]);

  assert.match(bodyLines(csv)[1], /,-5,-4.5,-3,-1,-2,/);
  assert.doesNotMatch(bodyLines(csv)[1], /'-5/);
});

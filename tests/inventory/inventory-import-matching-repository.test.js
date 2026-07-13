const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const contractPath = path.join(
  root,
  'src',
  'main',
  'features',
  'inventory',
  'inventory-import-matching.contract.js'
);
const repositoryPath = path.join(
  root,
  'src',
  'main',
  'features',
  'inventory',
  'inventory-import-matching.repository.js'
);

function loadRepository(queryHandler) {
  delete require.cache[repositoryPath];
  const originalLoad = Module._load;
  const queries = [];
  const pool = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });
      return queryHandler(sql, params, queries.length);
    },
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../database/connection') {
      return { getPool: () => pool };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return { repository: require(repositoryPath), queries };
  } finally {
    Module._load = originalLoad;
  }
}

function productRow(overrides = {}) {
  return {
    product_id: 1,
    name: 'Rice 5kg',
    sku: 'RICE-5',
    barcode: '00012345',
    category_name: 'Grocery',
    brand_name: 'Local',
    unit_name: 'Bag',
    variant_name: null,
    purchase_price: '100.50',
    sale_price: '120.75',
    wholesale_price: '115.25',
    is_active: true,
    deleted_at: null,
    updated_at: '2026-07-13T10:00:00.000Z',
    ...overrides,
  };
}

test('Inventory import matching contracts create immutable plain data and preserve decimal strings', () => {
  const contract = require(contractPath);
  const product = contract.createProductMatch(productRow());
  assert.equal(product.costPrice, '100.50');
  assert.equal(product.sellingPrice, '120.75');
  assert.equal(product.wholesalePrice, '115.25');
  assert.equal(product.normalizedSku, 'rice-5');
  assert.equal(product.deleted, false);
  assert(Object.isFrozen(product));
  product.costPrice = '1.00';
  assert.equal(product.costPrice, '100.50');

  const identifier = contract.createProductIdentifier({
    sourceRowNumber: 2,
    sku: '  SKU-001  ',
    barcode: '  00001  ',
  });
  assert.deepEqual(
    {
      sourceRowNumber: identifier.sourceRowNumber,
      sku: identifier.sku,
      normalizedSku: identifier.normalizedSku,
      barcode: identifier.barcode,
      normalizedBarcode: identifier.normalizedBarcode,
    },
    {
      sourceRowNumber: 2,
      sku: 'SKU-001',
      normalizedSku: 'sku-001',
      barcode: '00001',
      normalizedBarcode: '00001',
    }
  );
});

test('Inventory import matching contracts reject malformed ids and executable or custom objects', () => {
  const contract = require(contractPath);
  assert.throws(
    () => contract.createProductIdentifier({ sourceRowNumber: 0, sku: 'SKU-1' }),
    /sourceRowNumber/
  );
  assert.throws(
    () => contract.createProductIdentifier({ sourceRowNumber: 1, sku: () => 'SKU' }),
    /executable/
  );
  class CustomPayload {
    constructor() {
      this.sourceRowNumber = 1;
      this.sku = 'SKU-1';
    }
  }
  assert.throws(() => contract.createProductIdentifier(new CustomPayload()), /plain data/);
  assert.throws(
    () =>
      contract.createProductMatch({
        ...productRow(),
        electronLike: { sender: { send() {} } },
      }),
    /custom objects|executable/
  );
});

test('Inventory import product lookup supports empty, SKU, Barcode, combined, inactive, deleted, and duplicate rows', async () => {
  const { repository, queries } = loadRepository(async (sql, params) => {
    assert.match(sql, /LOWER\(products\.sku\) = ANY\(\$1::text\[\]\)/);
    assert.match(sql, /LOWER\(products\.barcode\) = ANY\(\$2::text\[\]\)/);
    assert.deepEqual(params, [
      ['rice-5', 'flour-10'],
      ['00012345', '00099999'],
    ]);
    return {
      rows: [
        productRow({ product_id: 1, sku: 'RICE-5', barcode: '00012345' }),
        productRow({
          product_id: 2,
          name: 'Flour',
          sku: 'FLOUR-10',
          barcode: '00099999',
          is_active: false,
        }),
        productRow({
          product_id: 3,
          name: 'Deleted Rice',
          sku: 'RICE-5',
          barcode: 'DEL-0001',
          deleted_at: '2026-07-13T11:00:00.000Z',
        }),
      ],
    };
  });

  const empty = await repository.findProductsByIdentifiers();
  assert.deepEqual(empty, { ok: true, products: [] });
  assert.equal(queries.length, 0);

  const result = await repository.findProductsByIdentifiers({
    skus: [' RICE-5 ', 'flour-10'],
    barcodes: ['00012345', '00099999', ''],
  });
  assert.equal(result.ok, true);
  assert.equal(queries.length, 1);
  assert.equal(result.products.length, 3);
  assert.equal(result.products[1].active, false);
  assert.equal(result.products[2].deleted, true);
  assert.equal(result.products[0].costPrice, '100.50');
  assert.doesNotMatch(queries[0].sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bFOR\s+UPDATE\b/i);
});

test('Inventory import product lookup exposes conflicting products without classifying them', async () => {
  const { repository } = loadRepository(async () => ({
    rows: [
      productRow({ product_id: 11, sku: 'SKU-A', barcode: 'BAR-A' }),
      productRow({ product_id: 12, sku: 'SKU-B', barcode: 'BAR-B' }),
    ],
  }));
  const result = await repository.findProductsByIdentifiers({
    skus: ['SKU-A'],
    barcodes: ['BAR-B'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.products.map((product) => product.productId),
    [11, 12]
  );
});

test('Inventory import catalog lookup uses the allowlist and preserves active, inactive, duplicate, missing, and empty results', async () => {
  const seenTables = [];
  const { repository, queries } = loadRepository(async (sql, params) => {
    const table = ['categories', 'brands', 'units', 'variants'].find((item) =>
      sql.includes(`FROM ${item}`)
    );
    seenTables.push(table);
    assert(table);
    assert(params[0].every((value) => ['grocery', 'local'].includes(value)));
    return {
      rows: [
        {
          id: 1,
          name: 'Grocery',
          is_active: true,
          deleted_at: null,
          updated_at: '2026-07-13T10:00:00.000Z',
        },
        {
          id: 2,
          name: 'grocery',
          is_active: false,
          deleted_at: null,
          updated_at: '2026-07-13T10:10:00.000Z',
        },
      ],
    };
  });

  const result = await repository.findCatalogsByNames({
    category: [' Grocery ', 'grocery'],
    brand: ['Local'],
    unit: ['LOCAL'],
    variant: [' local '],
    unsupported: ['ignored'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seenTables, ['categories', 'brands', 'units', 'variants']);
  assert.equal(result.catalogs.category.length, 2);
  assert.equal(result.catalogs.category[0].normalizedName, 'grocery');
  assert.equal(result.catalogs.category[1].active, false);
  assert.equal(queries.length, 4);

  const empty = await repository.findCatalogsByNames();
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.catalogs, { category: [], brand: [], unit: [], variant: [] });
});

test('Inventory import default warehouse lookup returns safe default or null', async () => {
  const { repository, queries } = loadRepository(async () => ({
    rows: [
      {
        id: 7,
        name: 'Main Warehouse',
        is_active: true,
        updated_at: '2026-07-13T12:00:00.000Z',
      },
    ],
  }));
  const result = await repository.getDefaultWarehouse();
  assert.equal(result.ok, true);
  assert.equal(result.warehouse.warehouseId, 7);
  assert.match(queries[0].sql, /is_default = TRUE/);
  assert.doesNotMatch(queries[0].sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bFOR\s+UPDATE\b/i);

  const missing = loadRepository(async () => ({ rows: [] }));
  const missingResult = await missing.repository.getDefaultWarehouse();
  assert.equal(missingResult.ok, true);
  assert.equal(missingResult.warehouse, null);
});

test('Inventory import inventory lookup preserves missing rows, duplicates, quantity strings, and parameters', async () => {
  const { repository, queries } = loadRepository(async (sql, params) => {
    assert.deepEqual(params, [7, [1, 2, 3]]);
    return {
      rows: [
        {
          id: 100,
          product_id: 1,
          warehouse_id: 7,
          current_stock: '10.250',
          updated_at: '2026-07-13T12:00:00.000Z',
        },
        {
          id: 101,
          product_id: 1,
          warehouse_id: 7,
          current_stock: '11.000',
          updated_at: '2026-07-13T12:01:00.000Z',
        },
      ],
    };
  });
  const result = await repository.findInventoryTargets({
    productIds: [1, 1, 2, 3, 0, 'bad'],
    warehouseId: 7,
  });
  assert.equal(result.ok, true);
  assert.equal(result.inventoryTargets.length, 2);
  assert.equal(result.inventoryTargets[0].quantity, '10.250');
  assert.equal(queries.length, 1);
});

test('Inventory import stock movement summary reads grouped counts and latest timestamp only', async () => {
  const { repository, queries } = loadRepository(async (sql, params) => {
    assert.match(sql, /COUNT\(\*\)::int AS movement_count/);
    assert.match(sql, /MAX\(created_at\) AS latest_movement_at/);
    assert.deepEqual(params, [[1, 2]]);
    return {
      rows: [
        {
          product_id: 1,
          movement_count: 3,
          latest_movement_at: '2026-07-13T12:00:00.000Z',
        },
      ],
    };
  });
  const result = await repository.summarizeStockMovements({ productIds: [1, 2, 2] });
  assert.equal(result.ok, true);
  assert.equal(result.movementSummaries.length, 1);
  assert.equal(result.movementSummaries[0].movementCount, 3);
  assert.equal(queries.length, 1);

  const empty = await repository.summarizeStockMovements();
  assert.deepEqual(empty, { ok: true, movementSummaries: [] });
});

test('Inventory import matching repository sanitizes database failures', async () => {
  const { repository } = loadRepository(async () => {
    const error = new Error('SELECT * FROM secret_table at C:\\private\\file.js');
    error.code = '42601';
    throw error;
  });
  const result = await repository.findProductsByIdentifiers({ skus: ['SKU-1'] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVENTORY_IMPORT_MATCHING_READ_FAILED');
  assert.equal(result.message, 'Inventory import matching data could not be read.');
  assert.equal(result.reason, '42601');
  assert.doesNotMatch(JSON.stringify(result), /secret_table|C:\\private|SELECT \*/);
});

test('Inventory import matching files stay read-only and isolated from UI, IPC, and schema surfaces', () => {
  const fs = require('node:fs');
  const productionFiles = [
    path.join(root, 'src/main/features/inventory/inventory-import-matching.contract.js'),
    path.join(root, 'src/main/features/inventory/inventory-import-matching.repository.js'),
  ];
  productionFiles.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /ipcMain|ipcRenderer|BrowserWindow|document\.|showOpenDialog/);
    assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE/i);
  });
});

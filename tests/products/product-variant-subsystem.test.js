const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const servicePath = path.join(root, 'src', 'main', 'features', 'products', 'product.service.js');
const validationPath = path.join(
  root,
  'src',
  'main',
  'features',
  'products',
  'product.validation.js'
);
const schemaPath = path.join(root, 'src', 'main', 'database', 'schema.js');
const catalogRepositoryPath = path.join(
  root,
  'src',
  'main',
  'features',
  'catalog',
  'catalog.repository.js'
);
const productRepositoryPath = path.join(
  root,
  'src',
  'main',
  'features',
  'products',
  'product.repository.js'
);
const settingsRepositoryPath = path.join(
  root,
  'src',
  'main',
  'features',
  'settings',
  'settings.repository.js'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function validPayload(overrides = {}) {
  return {
    name: 'Variant Test Product',
    sku: 'VARIANT-TEST',
    barcode: 'VARIANT-TEST-BARCODE',
    categoryId: null,
    brandId: null,
    unitId: null,
    variantId: null,
    purchasePrice: 10,
    salePrice: 12,
    wholesalePrice: 11,
    minStockLevel: 1,
    currentStock: 2,
    isActive: true,
    ...overrides,
  };
}

function loadProductService({ productRepository = {}, catalogRepository = {} } = {}) {
  delete require.cache[servicePath];
  const originalLoad = Module._load;
  const calls = { activity: [], productPayloads: [], deleteAttempts: [] };

  const defaultProductRepository = {
    skuOrBarcodeExists: async () => null,
    createProduct: async (payload) => {
      calls.productPayloads.push(payload);
      return 101;
    },
    updateProduct: async (_id, payload) => {
      calls.productPayloads.push(payload);
      return true;
    },
    findProductById: async (id) => ({
      id,
      name: 'Variant Test Product',
      sku: 'VARIANT-TEST',
      barcode: 'VARIANT-TEST-BARCODE',
      variantId: null,
    }),
    ...productRepository,
  };

  const defaultCatalogRepository = {
    findCatalogById: async () => null,
    countCatalogProductReferences: async () => 0,
    softDeleteCatalog: async (type, id) => {
      calls.deleteAttempts.push([type, id]);
      return true;
    },
    createCatalog: async (type, payload) => ({ id: 7, ...payload, type }),
    updateCatalog: async (type, id, payload) => ({ id, ...payload, type }),
    listCatalog: async () => [],
    ...catalogRepository,
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../auth/auth.service') {
      return { getProfile: async () => ({ ok: true, profile: { id: 1, role: 'Admin' } }) };
    }
    if (request === '../activity/activity.repository') {
      return { createActivityLog: async (entry) => calls.activity.push(entry) };
    }
    if (request === '../catalog/catalog.repository') return defaultCatalogRepository;
    if (request === './product.repository') return defaultProductRepository;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return { service: require(servicePath), calls };
  } finally {
    Module._load = originalLoad;
  }
}

test('Variant schema is additive and backup coverage declares variants', () => {
  const schema = read(schemaPath);
  const settingsRepository = read(settingsRepositoryPath);

  assert.match(schema, /CREATE TABLE IF NOT EXISTS variants/);
  assert.match(
    schema,
    /ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES variants\(id\)/
  );
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_name_unique/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_products_variant_id/);
  assert.match(settingsRepository, /name:\s*'variants'/);
});

test('Variant catalog stays on the fixed catalog table whitelist', () => {
  const catalogRepository = read(catalogRepositoryPath);

  assert.match(catalogRepository, /variants:\s*'variants'/);
  assert.match(catalogRepository, /function assertTable\(table\)/);
  assert.match(
    catalogRepository,
    /const tableName = assertTable\(table\);[\s\S]*FROM \$\{tableName\}/
  );
  assert.doesNotMatch(catalogRepository, /TABLES\[String\(table/);
});

test('Product repository persists and reads nullable variant metadata only', () => {
  const productRepository = read(productRepositoryPath);

  assert.match(productRepository, /variantId:\s*row\.variant_id/);
  assert.match(productRepository, /variantName:\s*row\.variant_name/);
  assert.match(productRepository, /LEFT JOIN variants ON variants\.id = products\.variant_id/);
  assert.match(productRepository, /variant_id/);
  assert.doesNotMatch(
    productRepository,
    /variant_stock|variant_price|variant_barcode|variant_expiry/
  );
});

test('Product validation accepts optional Variant id and rejects invalid Variant id', () => {
  const { validateProductPayload } = require(validationPath);

  const withoutVariant = validateProductPayload(validPayload({ variantId: '' }));
  assert.equal(withoutVariant.ok, true);
  assert.equal(withoutVariant.value.variantId, null);

  const withVariant = validateProductPayload(validPayload({ variantId: '42' }));
  assert.equal(withVariant.ok, true);
  assert.equal(withVariant.value.variantId, 42);

  const invalidVariant = validateProductPayload(validPayload({ variantId: 'abc' }));
  assert.equal(invalidVariant.ok, false);
  assert.match(invalidVariant.message, /Variant is invalid/);
});

test('Product create accepts null Variant and valid active Variant', async () => {
  const { service, calls } = loadProductService({
    catalogRepository: {
      findCatalogById: async (_type, id) => ({ id, name: 'Large', isActive: true }),
    },
  });

  const nullResult = await service.createProduct(validPayload({ variantId: null }));
  assert.equal(nullResult.ok, true);
  assert.equal(calls.productPayloads[0].variantId, null);

  const variantResult = await service.createProduct(
    validPayload({ sku: 'VARIANT-2', variantId: 5 })
  );
  assert.equal(variantResult.ok, true);
  assert.equal(calls.productPayloads[1].variantId, 5);
});

test('Product create rejects inactive or missing Variant assignment', async () => {
  const { service } = loadProductService({
    catalogRepository: {
      findCatalogById: async () => null,
    },
  });

  const result = await service.createProduct(validPayload({ variantId: 99 }));

  assert.equal(result.ok, false);
  assert.match(result.message, /Variant is invalid or inactive/);
});

test('Product update preserves, changes, and clears Variant intentionally', async () => {
  let findCount = 0;
  const { service, calls } = loadProductService({
    productRepository: {
      findProductById: async (id) => {
        findCount += 1;
        return {
          id,
          name: 'Variant Test Product',
          sku: 'VARIANT-TEST',
          barcode: 'VARIANT-TEST-BARCODE',
          variantId: findCount === 1 ? 9 : calls.productPayloads.at(-1)?.variantId,
        };
      },
    },
    catalogRepository: {
      findCatalogById: async (_type, id, options = {}) => {
        if (id === 9 && options.includeInactive)
          return { id, name: 'Inactive Existing', isActive: false };
        if (id === 10 && !options.includeInactive)
          return { id, name: 'Active New', isActive: true };
        return null;
      },
    },
  });

  const preserve = await service.updateProduct(101, validPayload({ variantId: 9 }));
  assert.equal(preserve.ok, true);
  assert.equal(calls.productPayloads[0].variantId, 9);

  findCount = 0;
  const change = await service.updateProduct(101, validPayload({ variantId: 10 }));
  assert.equal(change.ok, true);
  assert.equal(calls.productPayloads[1].variantId, 10);

  findCount = 0;
  const clear = await service.updateProduct(101, validPayload({ variantId: null }));
  assert.equal(clear.ok, true);
  assert.equal(calls.productPayloads[2].variantId, null);
});

test('Product update preserves Variant when the payload field is missing', async () => {
  const { service, calls } = loadProductService({
    productRepository: {
      findProductById: async (id) => ({
        id,
        name: 'Variant Test Product',
        sku: 'VARIANT-TEST',
        barcode: 'VARIANT-TEST-BARCODE',
        variantId: 11,
      }),
    },
    catalogRepository: {
      findCatalogById: async (_type, id, options = {}) =>
        id === 11 && options.includeInactive
          ? { id, name: 'Preserved Variant', isActive: false }
          : null,
    },
  });
  const payload = validPayload();
  delete payload.variantId;

  const result = await service.updateProduct(101, payload);

  assert.equal(result.ok, true);
  assert.equal(calls.productPayloads[0].variantId, 11);
});

test('Variant delete is blocked while active Products reference it', async () => {
  const { service, calls } = loadProductService({
    catalogRepository: {
      countCatalogProductReferences: async () => 2,
    },
  });

  const result = await service.deleteCatalog('variants', 5);

  assert.equal(result.ok, false);
  assert.match(result.message, /assigned to products/);
  assert.deepEqual(calls.deleteAttempts, []);
});

test('Unreferenced Variant can use the existing catalog soft-delete workflow', async () => {
  const { service, calls } = loadProductService({
    catalogRepository: {
      countCatalogProductReferences: async () => 0,
    },
  });

  const result = await service.deleteCatalog('variants', 6);

  assert.equal(result.ok, true);
  assert.deepEqual(calls.deleteAttempts, [['variants', 6]]);
});

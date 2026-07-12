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
const productRepositoryPath = path.join(
  root,
  'src',
  'main',
  'features',
  'products',
  'product.repository.js'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function validPayload(overrides = {}) {
  return {
    name: 'Price Change Product',
    sku: 'PRICE-CHANGE',
    barcode: 'PRICE-CHANGE-BARCODE',
    categoryId: null,
    brandId: null,
    unitId: null,
    variantId: null,
    purchasePrice: 10,
    salePrice: 12,
    wholesalePrice: 11,
    minStockLevel: 1,
    currentStock: 2,
    allowSalePriceOverride: false,
    autoUpdateSalePriceFromPurchase: false,
    trackExpiry: false,
    expiryRequired: false,
    isActive: true,
    ...overrides,
  };
}

function productFromPayload(payload, overrides = {}) {
  return {
    id: 101,
    name: payload.name,
    sku: payload.sku,
    barcode: payload.barcode,
    variantId: payload.variantId ?? null,
    purchasePrice: Number(payload.purchasePrice),
    salePrice: Number(payload.salePrice),
    wholesalePrice: Number(payload.wholesalePrice),
    minStockLevel: Number(payload.minStockLevel),
    currentStock: Number(payload.currentStock),
    allowSalePriceOverride: payload.allowSalePriceOverride === true,
    allowPriceChange: payload.allowPriceChange === true,
    autoUpdateSalePriceFromPurchase: payload.autoUpdateSalePriceFromPurchase === true,
    trackExpiry: payload.trackExpiry === true,
    expiryRequired: payload.expiryRequired === true,
    expiryAlertDays: payload.expiryAlertDays ?? null,
    isActive: payload.isActive !== false,
    ...overrides,
  };
}

function loadProductService({
  existingProduct = productFromPayload(validPayload()),
  catalog = {},
} = {}) {
  delete require.cache[servicePath];
  const originalLoad = Module._load;
  const calls = { activity: [], productPayloads: [], updateCount: 0 };
  let storedProduct = { ...existingProduct };

  const productRepository = {
    skuOrBarcodeExists: async () => null,
    createProduct: async (payload) => {
      calls.productPayloads.push(payload);
      storedProduct = productFromPayload(payload, { id: 101 });
      return 101;
    },
    updateProduct: async (_id, payload) => {
      calls.updateCount += 1;
      calls.productPayloads.push(payload);
      storedProduct = productFromPayload(payload, { id: storedProduct.id });
      return true;
    },
    findProductById: async (id) => ({ ...storedProduct, id }),
  };

  const catalogRepository = {
    findCatalogById: async () => null,
    ...catalog,
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../auth/auth.service') {
      return { getProfile: async () => ({ ok: true, profile: { id: 1, role: 'Admin' } }) };
    }
    if (request === '../activity/activity.repository') {
      return { createActivityLog: async (entry) => calls.activity.push(entry) };
    }
    if (request === '../catalog/catalog.repository') return catalogRepository;
    if (request === './product.repository') return productRepository;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return { service: require(servicePath), calls, getStoredProduct: () => storedProduct };
  } finally {
    Module._load = originalLoad;
  }
}

test('Allow Price Change schema and repository mapping are additive and default false', () => {
  const schema = read(schemaPath);
  const repository = read(productRepositoryPath);

  assert.match(schema, /allow_price_change BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(
    schema,
    /ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_price_change BOOLEAN NOT NULL DEFAULT FALSE/
  );
  assert.match(repository, /allowPriceChange:\s*Boolean\(row\.allow_price_change\)/);
  assert.match(repository, /allow_price_change/);
  assert.doesNotMatch(repository, /variant_price|price_matrix|price_list/);
});

test('Product validation accepts boolean Allow Price Change and rejects malformed values', () => {
  const { validateProductPayload } = require(validationPath);

  const omitted = validateProductPayload(validPayload());
  assert.equal(omitted.ok, true);
  assert.equal(omitted.value.allowPriceChange, false);
  assert.equal(omitted.value.allowPriceChangePresent, false);

  const enabled = validateProductPayload(validPayload({ allowPriceChange: true }));
  assert.equal(enabled.ok, true);
  assert.equal(enabled.value.allowPriceChange, true);
  assert.equal(enabled.value.allowPriceChangePresent, true);

  const disabled = validateProductPayload(validPayload({ allowPriceChange: false }));
  assert.equal(disabled.ok, true);
  assert.equal(disabled.value.allowPriceChange, false);
  assert.equal(disabled.value.allowPriceChangePresent, true);

  const malformed = validateProductPayload(validPayload({ allowPriceChange: 'true' }));
  assert.equal(malformed.ok, false);
  assert.match(malformed.message, /allowPriceChange must be true or false/);
});

test('Product creation may set initial Sale Price with policy off or on', async () => {
  const { service, calls } = loadProductService();

  const policyOff = await service.createProduct(validPayload({ allowPriceChange: false }));
  assert.equal(policyOff.ok, true);
  assert.equal(calls.productPayloads[0].salePrice, '12.00');
  assert.equal(calls.productPayloads[0].allowPriceChange, false);

  const policyOn = await service.createProduct(
    validPayload({
      sku: 'PRICE-CHANGE-2',
      barcode: 'PRICE-CHANGE-BARCODE-2',
      allowPriceChange: true,
    })
  );
  assert.equal(policyOn.ok, true);
  assert.equal(calls.productPayloads[1].allowPriceChange, true);
});

test('Product edit preserves missing policy field and permits unchanged Sale Price while policy is off', async () => {
  const existing = productFromPayload(validPayload({ allowPriceChange: false }));
  const { service, calls } = loadProductService({ existingProduct: existing });

  const payload = validPayload({ name: 'Renamed Product' });
  delete payload.allowPriceChange;
  const result = await service.updateProduct(101, payload);

  assert.equal(result.ok, true);
  assert.equal(calls.updateCount, 1);
  assert.equal(calls.productPayloads[0].name, 'Renamed Product');
  assert.equal(calls.productPayloads[0].allowPriceChange, false);
});

test('Product edit rejects Sale Price change while stored policy is off and writes nothing', async () => {
  const existing = productFromPayload(validPayload({ salePrice: 12, allowPriceChange: false }));
  const { service, calls, getStoredProduct } = loadProductService({ existingProduct: existing });

  const result = await service.updateProduct(
    101,
    validPayload({ salePrice: 15, allowPriceChange: true, name: 'Crafted Bypass' })
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    'Sale Price cannot be changed because Allow Price Change is disabled for this product.'
  );
  assert.equal(calls.updateCount, 0);
  assert.equal(getStoredProduct().name, existing.name);
  assert.equal(getStoredProduct().salePrice, 12);
  assert.equal(getStoredProduct().allowPriceChange, false);
});

test('Policy can be enabled first, then a later Sale Price change succeeds', async () => {
  const existing = productFromPayload(validPayload({ salePrice: 12, allowPriceChange: false }));
  const { service, calls, getStoredProduct } = loadProductService({ existingProduct: existing });

  const enable = await service.updateProduct(101, validPayload({ allowPriceChange: true }));
  assert.equal(enable.ok, true);
  assert.equal(calls.updateCount, 1);
  assert.equal(getStoredProduct().allowPriceChange, true);
  assert.equal(getStoredProduct().salePrice, 12);

  const change = await service.updateProduct(
    101,
    validPayload({ salePrice: 15, allowPriceChange: true })
  );
  assert.equal(change.ok, true);
  assert.equal(calls.updateCount, 2);
  assert.equal(getStoredProduct().salePrice, 15);
});

test('Stored enabled policy permits Sale Price change and explicit disable in one atomic update', async () => {
  const existing = productFromPayload(validPayload({ salePrice: 12, allowPriceChange: true }));
  const { service, calls, getStoredProduct } = loadProductService({ existingProduct: existing });

  const result = await service.updateProduct(
    101,
    validPayload({ salePrice: 18, allowPriceChange: false })
  );

  assert.equal(result.ok, true);
  assert.equal(calls.updateCount, 1);
  assert.equal(getStoredProduct().salePrice, 18);
  assert.equal(getStoredProduct().allowPriceChange, false);
});

test('Missing Allow Price Change field preserves true during Product update', async () => {
  const existing = productFromPayload(validPayload({ salePrice: 12, allowPriceChange: true }));
  const { service, calls, getStoredProduct } = loadProductService({ existingProduct: existing });
  const payload = validPayload({ name: 'Preserve Policy' });
  delete payload.allowPriceChange;

  const result = await service.updateProduct(101, payload);

  assert.equal(result.ok, true);
  assert.equal(calls.productPayloads[0].allowPriceChange, true);
  assert.equal(getStoredProduct().allowPriceChange, true);
});

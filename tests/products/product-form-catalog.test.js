const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const indexHtmlPath = path.join(root, 'src', 'renderer', 'index.html');
const compactCssPath = path.join(root, 'src', 'renderer', 'styles', 'compact.css');
const featureGatePath = path.join(root, 'src', 'renderer', 'feature-gate.js');
const productsRendererPath = path.join(
  root,
  'src',
  'main',
  'features',
  'products',
  'products.renderer.js'
);
const productsApiPath = path.join(root, 'src', 'main', 'features', 'products', 'products.api.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadProductsApi(posApiOverrides = {}) {
  const catalogCalls = [];
  const window = {
    FeatureGate: { check: () => ({ ok: true, visible: true, message: 'ok' }) },
    posApi: {
      catalog: {
        list: async (type) => {
          catalogCalls.push(['list', type]);
          return { ok: true, items: [{ id: 7, name: `${type} item` }] };
        },
        create: async (type, payload) => {
          catalogCalls.push(['create', type, payload]);
          return { ok: true, item: { id: 8, name: payload.name } };
        },
        delete: async (type, id) => {
          catalogCalls.push(['delete', type, id]);
          return { ok: true };
        },
        ...posApiOverrides.catalog,
      },
      products: {
        list: async () => ({ ok: true, products: [] }),
        ...posApiOverrides.products,
      },
    },
  };
  const context = vm.createContext({ window });
  vm.runInContext(read(productsApiPath), context, { filename: productsApiPath });
  return { api: window.ProductsApi, catalogCalls };
}

test('Product Form has one form and one shared catalog dialog', () => {
  const html = read(indexHtmlPath);
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.equal((html.match(/id="productFormPanel"/g) || []).length, 1);
  assert.equal((html.match(/id="productForm"/g) || []).length, 1);
  assert.equal((html.match(/id="pfCatalogPanel"/g) || []).length, 1);
  assert.deepEqual(duplicateIds, []);
});

test('Product Form exposes Allow Price Change as an enabled product policy control', () => {
  const html = read(indexHtmlPath);
  const renderer = read(productsRendererPath);

  const control = html.match(/<input[^>]+id="allowPriceChange"[^>]*>/)?.[0] || '';
  assert.ok(control, 'Allow Price Change control should have a stable id');
  assert.doesNotMatch(control, /\sdisabled(?:\s|>|=)/);
  assert.match(renderer, /product\.allowPriceChange === true/);
  assert.match(renderer, /'allowPriceChange'/);
  assert.match(renderer, /allowPriceChange: \$id\('allowPriceChange'\)\?\.checked === true/);
});

test('supported catalog plus buttons are enabled including Variant', () => {
  const html = read(indexHtmlPath);
  for (const type of ['categories', 'brands', 'units', 'variants']) {
    const match = html.match(new RegExp(`<button[^>]+data-catalog-open="${type}"[^>]*>`));
    assert.ok(match, `${type} plus button should exist`);
    assert.doesNotMatch(match[0], /\sdisabled(?:\s|>|=)/, `${type} plus button should be enabled`);
  }

  const variantSelect =
    html.match(/<select[^>]+id="productVariantCatalogPreview"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(variantSelect, /\sdisabled(?:\s|>|=)/);
});

test('Product Form stage indicators are informational, colored, and non-tab navigation', () => {
  const html = read(indexHtmlPath);
  const css = read(compactCssPath);

  assert.match(html, /<ol class="pf-section-steps" aria-label="Product form stages">/);
  assert.doesNotMatch(html, /pf-section-tabs/);
  for (const stepClass of [
    'pf-step-identity',
    'pf-step-pricing',
    'pf-step-policy',
    'pf-step-media',
  ]) {
    assert.match(html, new RegExp(`class="pf-step ${stepClass}"`));
    assert.match(css, new RegExp(`\\.pf-${stepClass.replace('pf-', '')}`));
  }
  assert.match(css, /#productFormPanel \.pf-step\s*\{[^}]*cursor:\s*default;/);
  assert.doesNotMatch(css, /\.pf-section-tabs|cursor:\s*pointer[^}]*pf-step/);
});

test('Products API supports complete catalog backend types including variants', async () => {
  const { api, catalogCalls } = loadProductsApi();

  const categories = await api.loadCatalogType('categories');
  assert.equal(categories.ok, true);
  assert.deepEqual(catalogCalls[0], ['list', 'categories']);

  const variants = await api.loadCatalogType('variants');
  assert.equal(variants.ok, true);
  assert.deepEqual(catalogCalls[1], ['list', 'variants']);

  const saved = await api.saveCatalogItem('brands', { name: 'New Brand' });
  assert.equal(saved.ok, true);
  assert.equal(saved.item.id, 8);
  assert.equal(catalogCalls[2][0], 'create');
  assert.equal(catalogCalls[2][1], 'brands');

  const savedVariant = await api.saveCatalogItem('variants', { name: 'V1' });
  assert.equal(savedVariant.ok, true);
  assert.equal(catalogCalls[3][0], 'create');
  assert.equal(catalogCalls[3][1], 'variants');

  const unsupportedSave = await api.saveCatalogItem('taxes', { name: 'VAT' });
  assert.equal(unsupportedSave.ok, false);
  assert.equal(catalogCalls.length, 4, 'unsupported save must not call backend');
});

test('supported Product catalog management is enabled by the feature gate', () => {
  const window = {};
  const context = vm.createContext({ window, Date });

  vm.runInContext(read(featureGatePath), context, { filename: featureGatePath });

  const result = window.FeatureGate.check('products.catalog_management');
  assert.equal(result.ok, true);
  assert.equal(result.status, 'safe');
});

test('Products API fails closed for malformed catalog create responses', async () => {
  const { api, catalogCalls } = loadProductsApi({
    catalog: {
      create: async (type) => {
        catalogCalls.push(['create', type]);
        return { ok: true };
      },
    },
  });

  const result = await api.saveCatalogItem('units', { name: 'Box', shortName: 'BX' });

  assert.equal(result.ok, false);
  assert.match(result.message, /not returned/i);
  assert.deepEqual(catalogCalls, [['create', 'units']]);
});

test('Products API loads Variant with the shared catalog payload', async () => {
  const { api, catalogCalls } = loadProductsApi();

  const result = await api.loadCatalog();

  assert.equal(result.ok, true);
  assert.deepEqual(
    catalogCalls.map((call) => call[1]),
    ['categories', 'brands', 'units', 'variants']
  );
  assert.equal(result.catalog.variants[0].name, 'variants item');
});

test('Product renderer preserves form state while catalog dialog is used', () => {
  const renderer = read(productsRendererPath);
  const saveCatalogBlock = renderer.match(
    /async function saveCatalogItemFromForm\(e\) \{[\s\S]*?\n  \}/
  )?.[0];

  assert.ok(saveCatalogBlock, 'saveCatalogItemFromForm should exist');
  assert.match(saveCatalogBlock, /refreshCatalogType\(type, selectedId\)/);
  assert.match(saveCatalogBlock, /const selectedId = res\.item\?\.id;/);
  assert.match(saveCatalogBlock, /if \(_catalogSaveInFlight\) return;/);
  assert.match(saveCatalogBlock, /if \(!payload\.name\)/);
  assert.match(saveCatalogBlock, /Unit short name is required/);
  assert.doesNotMatch(saveCatalogBlock, /openProductForm\(|closeProductForm\(|location\.reload/);
  assert.doesNotMatch(saveCatalogBlock, /\$id\('form'\)\?\.reset\(\)/);
});

test('Add and Edit product paths use the same Product Form', () => {
  const renderer = read(productsRendererPath);

  assert.match(renderer, /newProductButton[\s\S]*openProductForm\(null\)/);
  assert.match(renderer, /loadProductForEdit[\s\S]*openProductForm\(res\.product\)/);
  assert.match(renderer, /set\('productVariantCatalogPreview', product\.variantId\)/);
  assert.match(
    renderer,
    /variantId: Number\(\$id\('productVariantCatalogPreview'\)\?\.value\) \|\| null/
  );
  assert.match(renderer, /barcodeButton\.disabled = !hasSavedProduct/);
  assert.match(renderer, /Save the product before printing a barcode/);
  assert.doesNotMatch(renderer, /location\.reload/);
  assert.doesNotMatch(renderer, /BrowserWindow|ipcRenderer|require\(['"]electron['"]\)/);
});

test('Product renderer prevents duplicate save and disabled catalog actions', () => {
  const renderer = read(productsRendererPath);

  assert.match(renderer, /let _productSaveInFlight = false;/);
  assert.match(renderer, /if \(_productSaveInFlight\) return;/);
  assert.match(renderer, /let _catalogSaveInFlight = false;/);
  assert.match(renderer, /if \(_catalogSaveInFlight\) return;/);
  assert.match(
    renderer,
    /if \(button\.disabled \|\| button\.getAttribute\('aria-disabled'\) === 'true'\) return;/
  );
});

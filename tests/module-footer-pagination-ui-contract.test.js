const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

function readFeatureCss(feature, file) {
  return fs.readFileSync(path.join(repoRoot, 'src/main/features', feature, file), 'utf8');
}

function blockFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*{([\\s\\S]*?)\\n\\s*}`, 'g');
  return Array.from(css.matchAll(pattern)).at(-1)?.[1] || '';
}

function blockContaining(css, selector, text) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*{([\\s\\S]*?)\\n\\s*}`, 'g');
  return (
    Array.from(css.matchAll(pattern))
      .map((match) => match[1])
      .find((block) => block.includes(text)) || ''
  );
}

test('User Management remains the bottom status bar reference', () => {
  const css = readFeatureCss('access-control', 'access-control.css');
  const footer = blockFor(css, '.epos-users-footer');

  assert.match(footer, /padding:\s*8px 12px;/);
  assert.match(footer, /font-size:\s*11px;/);
  assert.match(footer, /font-weight:\s*850;/);
});

test('Inventory pagination footer uses compact controls and preserves table flex growth', () => {
  const css = readFeatureCss('inventory', 'inventory.css');
  const footer = blockFor(css, '.epos-inventory-pagination');
  const controls = blockFor(css, '.epos-inventory-page-controls');

  assert.match(footer, /min-height:\s*34px;/);
  assert.match(footer, /padding:\s*2px 0;/);
  assert.match(controls, /gap:\s*6px;/);
  assert.match(
    css,
    /\.epos-inventory-pagination button,\s*[\s\S]*?\.epos-inventory-pagination select\s*{[\s\S]*?height:\s*28px;/
  );
  assert.match(css, /\.epos-inventory-table-card\s*{[\s\S]*?flex:\s*1;/);
  assert.doesNotMatch(footer, /min-height:\s*4[04]px;|padding:\s*[56]px 0;/);
});

test('Purchases pagination footer no longer reserves the oversized control band', () => {
  const css = readFeatureCss('purchases', 'purchases.css');
  const footer = blockContaining(css, '.epos-purchases-footer', 'min-height: 36px;');

  assert.match(footer, /min-height:\s*36px;/);
  assert.match(footer, /padding:\s*2px 14px;/);
  assert.match(
    css,
    /\.epos-purchases-pagination select,\s*[\s\S]*?\.epos-purchases-pagination button\s*{[\s\S]*?min-height:\s*28px;/
  );
  assert.match(
    css,
    /\.epos-purchases-pagination strong\s*{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;/
  );
  assert.match(css, /\.epos-purchases-table-card\s*{[\s\S]*?min-height:\s*0;/);
  assert.doesNotMatch(footer, /min-height:\s*44px;|padding:\s*6px 14px;/);
  assert.match(
    css,
    /@media \(max-width: 1366px\)[\s\S]*?\.epos-purchases-footer\s*{[\s\S]*?padding:\s*2px 10px;/
  );
});

test('Customers and Products status footers stay compact while preserving labels', () => {
  const customersCss = readFeatureCss('customers', 'customers.css');
  const productsCss = readFeatureCss('products', 'products.css');
  const customersFooter = blockFor(customersCss, '.epos-customers-footer');
  const productsFooter = blockFor(productsCss, '.epos-products-footer');

  assert.match(customersFooter, /align-items:\s*center;/);
  assert.match(customersFooter, /padding:\s*4px 12px;/);
  assert.match(customersFooter, /font-size:\s*10px;/);
  assert.match(customersFooter, /font-weight:\s*800;/);
  assert.doesNotMatch(customersFooter, /padding:\s*(?:10px 14px|7px 12px);/);

  assert.match(productsFooter, /align-items:\s*center;/);
  assert.match(productsFooter, /padding:\s*4px 10px;/);
  assert.match(productsFooter, /font-size:\s*10px;/);
  assert.match(productsFooter, /font-weight:\s*800;/);
  assert.doesNotMatch(productsFooter, /padding:\s*5px 10px;/);
});

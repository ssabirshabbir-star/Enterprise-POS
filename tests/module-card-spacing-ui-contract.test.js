const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const shellRules = [
  {
    name: 'Products',
    file: 'src/main/features/products/products.css',
    moduleId: 'productModule',
    padding: '5px 8px 8px',
  },
  {
    name: 'Inventory',
    file: 'src/main/features/inventory/inventory.css',
    moduleId: 'inventoryModule',
    padding: '5px 8px 8px',
  },
  {
    name: 'Purchases',
    file: 'src/main/features/purchases/purchases.css',
    moduleId: 'purchaseModule',
    padding: '5px 12px 12px',
  },
  {
    name: 'Customers',
    file: 'src/main/features/customers/customers.css',
    moduleId: 'customersModule',
    padding: '5px 8px 8px',
  },
  {
    name: 'User Management',
    file: 'src/main/features/access-control/access-control.css',
    moduleId: 'usersModule',
    padding: '5px 10px 10px',
  },
];

test('major modules normalize card top spacing at the app shell', () => {
  for (const rule of shellRules) {
    const css = read(rule.file);
    const selector = `#dashboard #appMain:has(#${rule.moduleId}:not(.hidden))`;
    const escapedSelector = selector.replace(/[()[\].#]/g, '\\$&');
    const escapedPadding = rule.padding.replace(/\s/g, '\\s+');

    assert.match(
      css,
      new RegExp(`${escapedSelector}\\s*{[\\s\\S]*?padding:\\s*${escapedPadding}\\s*!important;`),
      `${rule.name} should use the Suppliers top-spacing geometry at the app shell`
    );
    assert.doesNotMatch(
      css,
      new RegExp(`#dashboard\\s+main:has\\(#${rule.moduleId}:not\\(\\.hidden\\)\\)`),
      `${rule.name} should not use broad nested-main route shell geometry`
    );
  }
});

test('Suppliers remains the certified top-spacing reference', () => {
  const compactCss = read('src/renderer/styles/compact.css');
  const suppliersCss = read('src/main/features/suppliers/suppliers.css');

  assert.match(
    compactCss,
    /#dashboard #appMain:has\(#suppliersModule:not\(\.hidden\)\)\s*{[\s\S]*?padding-block:\s*4px !important;/
  );
  assert.match(suppliersCss, /\.epos-suppliers-page\s*{[\s\S]*?padding:\s*1px 0 4px 10px;/);
});

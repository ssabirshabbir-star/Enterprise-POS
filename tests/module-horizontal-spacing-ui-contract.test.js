const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const routeShells = [
  {
    name: 'Dashboard',
    file: 'src/main/features/dashboard/dashboard.css',
    moduleId: 'dashboardRoute',
    padding: '8px',
  },
  {
    name: 'Products',
    file: 'src/main/features/products/products.css',
    moduleId: 'productModule',
    padding: '5px 8px 8px',
  },
  {
    name: 'Inventory reference',
    file: 'src/main/features/inventory/inventory.css',
    moduleId: 'inventoryModule',
    padding: '5px 8px 8px',
  },
  {
    name: 'Purchases',
    file: 'src/main/features/purchases/purchases.css',
    moduleId: 'purchaseModule',
    padding: '5px 8px 12px',
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
    padding: '5px 8px 10px',
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('module route shells use Inventory horizontal geometry without scrollbar reservation', () => {
  for (const shell of routeShells) {
    const css = read(shell.file);
    const selector = `#dashboard #appMain:has(#${shell.moduleId}:not(.hidden))`;
    const selectorPattern = escapeRegExp(selector);
    const paddingPattern = shell.padding.replace(/\s/g, '\\s+');

    assert.match(
      css,
      new RegExp(`${selectorPattern}\\s*{[\\s\\S]*?padding:\\s*${paddingPattern}\\s*!important;`),
      `${shell.name} should declare its app-shell padding at the route host`
    );
    assert.match(
      css,
      new RegExp(`${selectorPattern}\\s*{[\\s\\S]*?scrollbar-gutter:\\s*auto;`),
      `${shell.name} should not reserve a right-side scrollbar gutter`
    );
    assert.doesNotMatch(
      css,
      new RegExp(`#dashboard\\s+main:has\\(#${shell.moduleId}:not\\(\\.hidden\\)\\)`),
      `${shell.name} should not use broad nested-main route shell geometry`
    );
  }
});

test('Suppliers removes one-sided horizontal page padding while preserving vertical insets', () => {
  const compactCss = read('src/renderer/styles/compact.css');
  const suppliersCss = read('src/main/features/suppliers/suppliers.css');

  assert.match(
    compactCss,
    /#dashboard #appMain:has\(#suppliersModule:not\(\.hidden\)\)\s*{[\s\S]*?padding:\s*4px 8px !important;[\s\S]*?scrollbar-gutter:\s*auto;/
  );
  assert.match(suppliersCss, /\.epos-suppliers-page\s*{[\s\S]*?padding:\s*1px 0 4px;/);
  assert.match(
    suppliersCss,
    /\.epos-suppliers-stats,\s*[\s\S]*?\.epos-suppliers-bottom-actions\s*{[\s\S]*?padding-right:\s*0;/
  );
  assert.doesNotMatch(suppliersCss, /padding:\s*1px 0 4px 1[02]px;/);
  assert.doesNotMatch(suppliersCss, /padding-right:\s*1[02]px;/);
});

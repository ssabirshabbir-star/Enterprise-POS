const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertRule(source, selector, declaration, message) {
  const pattern = new RegExp(`${selector}\\s*{[\\s\\S]*?${declaration}`);
  assert.match(source, pattern, message);
}

function blockFor(source, selector) {
  const pattern = new RegExp(`${selector}\\s*{[^}]*}`);
  return source.match(pattern)?.[0] || '';
}

test('Inventory and User Management use the Products stat-card bottom gap contract', () => {
  const productsCss = read('src/main/features/products/products.css');
  const inventoryCss = read('src/main/features/inventory/inventory.css');
  const usersCss = read('src/main/features/access-control/access-control.css');
  const inventoryPageBlock = blockFor(inventoryCss, '\\.epos-inventory-page');
  const usersPageBlock = blockFor(usersCss, '\\.epos-users-page');

  assertRule(
    productsCss,
    '\\.epos-products-page',
    'gap:\\s*5px;',
    'Products remains the reference page gap'
  );
  assertRule(
    inventoryCss,
    '\\.epos-inventory-page',
    'gap:\\s*5px;',
    'Inventory should match Products below-card spacing'
  );
  assertRule(
    usersCss,
    '\\.epos-users-page',
    'gap:\\s*5px;',
    'User Management should match Products below-card spacing'
  );

  assert.doesNotMatch(inventoryPageBlock, /gap:\s*6px;/);
  assert.doesNotMatch(usersPageBlock, /gap:\s*6px;/);
});

test('stat-card spacing normalization preserves shell top and horizontal geometry', () => {
  const inventoryCss = read('src/main/features/inventory/inventory.css');
  const usersCss = read('src/main/features/access-control/access-control.css');

  assert.match(
    inventoryCss,
    /#dashboard #appMain:has\(#inventoryModule:not\(\.hidden\)\)\s*{[\s\S]*?padding:\s*5px 8px 8px !important;[\s\S]*?scrollbar-gutter:\s*auto;/
  );
  assert.match(
    usersCss,
    /#dashboard #appMain:has\(#usersModule:not\(\.hidden\)\)\s*{[\s\S]*?padding:\s*5px 8px 10px !important;[\s\S]*?scrollbar-gutter:\s*auto;/
  );
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'src/main/features/suppliers/index.html'), 'utf8');
const css = fs.readFileSync(
  path.join(repoRoot, 'src/main/features/suppliers/suppliers.css'),
  'utf8'
);
const compactCss = fs.readFileSync(path.join(repoRoot, 'src/renderer/styles/compact.css'), 'utf8');

test('Suppliers keeps the certified summary, tabs, filters, and bottom actions', () => {
  const statIds = [
    'supplierStatTotal',
    'supplierStatPurchases',
    'supplierStatPayments',
    'supplierStatDue',
    'supplierStatOverdue',
    'supplierStatToday',
  ];
  for (const id of statIds) assert.match(html, new RegExp(`id="${id}"`));

  const expectedControls = [
    'supplierInlineSearch',
    'supplierStatusFilter',
    'supplierCityFilter',
    'supplierFromDateFilter',
    'supplierToDateFilter',
    'supplierResetFilterButton',
  ];
  const positions = expectedControls.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position > -1));
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions
  );

  for (const label of [
    'Supplier List',
    'Purchases',
    'Payments',
    'Due / Outstanding',
    'Supplier Ledger',
    'Last Purchases',
    'Statements Unavailable',
    'Analytics Unavailable',
    'New Supplier',
    'New Purchase',
    'Make Payment',
    'Aging Unavailable',
    'WhatsApp',
  ]) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Suppliers compact layout transfers vertical space to the table viewport', () => {
  assert.match(
    css,
    /\.epos-suppliers-page\s*{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*4px;/
  );
  assert.match(
    css,
    /\.epos-suppliers-workspace\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;/
  );
  assert.match(
    css,
    /\.epos-suppliers-table-wrap\s*{[\s\S]*?height:\s*100%;[\s\S]*?overflow-y:\s*auto;/
  );
  assert.doesNotMatch(css, /\.epos-suppliers-table-wrap\s*{[\s\S]*?height:\s*calc\(100% - 42px\)/);
  assert.doesNotMatch(css, /\.epos-suppliers-table-wrap\s*{[\s\S]*?padding:\s*0 0 56px/);
  assert.match(css, /\.epos-suppliers-filters\s*{[\s\S]*?padding:\s*6px 8px;/);
});

test('Suppliers route keeps small shell insets without returning shared blank bands', () => {
  assert.match(
    compactCss,
    /#dashboard #appMain:has\(#suppliersModule:not\(\.hidden\)\)\s*{[\s\S]*?padding-block:\s*4px !important;[\s\S]*?overflow:\s*hidden;/
  );
  assert.doesNotMatch(
    compactCss,
    /#dashboard main:has\(#suppliersModule:not\(\.hidden\)\)\s*{[\s\S]*?padding-block:\s*0 !important;/
  );

  assert.match(
    compactCss,
    /#customersModule,\s*#expensesModule,\s*#usersModule,\s*#returnsModule,\s*#syncModule\s*{\s*padding-bottom:\s*8px;\s*}/
  );
  assert.doesNotMatch(
    compactCss,
    /#suppliersModule,\s*#expensesModule,[\s\S]{0,80}padding-bottom:\s*8px/
  );

  assert.doesNotMatch(css, /margin-top:\s*-/);
  assert.doesNotMatch(css, /margin-bottom:\s*-/);
  assert.doesNotMatch(
    css,
    /\.(?:epos-suppliers-page|epos-suppliers-stats|epos-suppliers-workspace|epos-suppliers-table-wrap|epos-suppliers-bottom-actions)\s*{[^}]*transform:/s
  );
  assert.doesNotMatch(
    css,
    /\.(?:epos-suppliers-page|epos-suppliers-stats|epos-suppliers-workspace|epos-suppliers-table-wrap|epos-suppliers-bottom-actions)\s*{[^}]*position:\s*(?:absolute|fixed)/s
  );
});

test('Suppliers table header is taller while body row spacing remains compact', () => {
  assert.match(
    css,
    /\.epos-suppliers-table th\s*{[\s\S]*?height:\s*36px !important;[\s\S]*?padding:\s*4px 10px !important;/
  );
  assert.match(css, /\.epos-suppliers-table td\s*{[\s\S]*?padding:\s*8px 10px;/);
});

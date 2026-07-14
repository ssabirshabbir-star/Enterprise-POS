const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'src/main/features/customers/index.html'), 'utf8');
const css = fs.readFileSync(
  path.join(repoRoot, 'src/main/features/customers/customers.css'),
  'utf8'
);
const compactCss = fs.readFileSync(path.join(repoRoot, 'src/renderer/styles/compact.css'), 'utf8');

test('Customers keeps table and action surfaces present', () => {
  for (const label of [
    'Bulk Actions',
    'All Customers',
    'Active Customers',
    'Inactive Customers',
    '+ Add Customer',
    'Customer Ledger',
    'Action',
  ]) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(html, /class="epos-customers-table-wrap"/);
  assert.match(html, /class="epos-customers-table"/);
  assert.match(html, /id="customerPageList"/);
});

test('Dashboard shell padding targets only the route host main element', () => {
  assert.match(
    compactCss,
    /#dashboard #appMain\s*{[\s\S]*?padding:\s*12px !important;[\s\S]*?scrollbar-gutter:\s*stable;/
  );
  assert.doesNotMatch(
    compactCss,
    /#dashboard main\s*{[\s\S]*?padding:\s*12px !important;[\s\S]*?scrollbar-gutter:\s*stable;/
  );
});

test('Customers table owns full width inside its wrapper without stale max width rules', () => {
  assert.match(
    css,
    /\.epos-customers-workspace\s*{[\s\S]*?width:\s*100%;[\s\S]*?overflow:\s*hidden;/
  );
  assert.match(
    css,
    /\.epos-customers-card\s*{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;/
  );
  assert.match(
    css,
    /\.epos-customers-table-wrap\s*{[\s\S]*?overflow:\s*auto;[\s\S]*?scrollbar-gutter:\s*auto;[\s\S]*?width:\s*100%;/
  );
  assert.match(
    css,
    /\.epos-customers-table\s*{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?table-layout:\s*fixed;/
  );
  assert.match(
    css,
    /\.epos-customers-table th:nth-child\(11\),\s*\.epos-customers-table td:nth-child\(11\)\s*{[\s\S]*?width:\s*19%;[\s\S]*?white-space:\s*nowrap;/
  );
  assert.doesNotMatch(
    css,
    /\.epos-customers-(?:workspace|card|table-wrap|table)\s*{[^}]*max-width:\s*(?:calc\(|[0-9]+px|[0-9]+rem)/s
  );
  assert.doesNotMatch(css, /\.epos-customers-card\s*{[^}]*scrollbar-gutter:\s*stable/s);
});

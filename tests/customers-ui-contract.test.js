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
const renderer = fs.readFileSync(
  path.join(repoRoot, 'src/main/features/customers/customers.renderer.js'),
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
  assert.match(
    html,
    /<colgroup>[\s\S]*?epos-customers-col-group[\s\S]*?epos-customers-col-city[\s\S]*?epos-customers-col-action[\s\S]*?<\/colgroup>/
  );
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
  assert.match(css, /--customers-col-group:\s*9%;/);
  assert.match(css, /--customers-col-city:\s*11%;/);
  assert.match(css, /--customers-col-action:\s*13%;/);
  assert.match(
    css,
    /\.epos-customers-col-action\s*{\s*width:\s*var\(--customers-col-action\);\s*}/
  );
  assert.doesNotMatch(css, /nth-child\(11\)[\s\S]*?width:\s*19%;/);
  assert.doesNotMatch(css, /nth-child\(6\)[\s\S]*?width:\s*6%;/);
  assert.doesNotMatch(css, /nth-child\(7\)[\s\S]*?width:\s*5%;/);
  assert.match(
    css,
    /\.epos-customers-group-cell,\s*\.epos-customers-city-cell,\s*\.epos-customers-muted-cell\s*{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
  );
  assert.match(renderer, /class="epos-customers-group-cell" title=/);
  assert.match(renderer, /class="epos-customers-city-cell" title=/);
  assert.doesNotMatch(
    css,
    /\.epos-customers-(?:workspace|card|table-wrap|table)\s*{[^}]*max-width:\s*(?:calc\(|[0-9]+px|[0-9]+rem)/s
  );
  assert.doesNotMatch(css, /\.epos-customers-card\s*{[^}]*scrollbar-gutter:\s*stable/s);
});

test('Customers stat cards use Products and Inventory compact card-height geometry', () => {
  assert.match(
    css,
    /\.epos-customers-stats\s*{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\);/
  );
  assert.match(
    css,
    /\.epos-customers-stats article\s*{[\s\S]*?grid-template-columns:\s*38px minmax\(0, 1fr\);[\s\S]*?min-height:\s*58px;[\s\S]*?padding:\s*8px 10px;/
  );
  assert.match(
    css,
    /\.epos-customers-stats article > span\s*{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;/
  );
  assert.match(css, /\.epos-customers-stats strong\s*{[\s\S]*?margin-top:\s*2px;/);
  assert.match(css, /\.epos-customers-stats small\s*{[\s\S]*?margin-top:\s*1px;/);
});

test('Customer Ledger renders as a structured account workspace', () => {
  assert.match(renderer, /function renderCustomerLedgerWorkspace\(panel, data\)/);
  assert.match(renderer, /Customer Account/);
  assert.match(renderer, /epos-ledger-hero-copy/);
  assert.match(renderer, /<h2 class="epos-ledger-hero-title">Customer Ledger<\/h2>/);
  assert.match(renderer, /epos-ledger-hero-subtitle/);
  assert.match(renderer, /epos-ledger-summary-card/);
  assert.match(renderer, /epos-ledger-stat-grid/);
  assert.match(renderer, /Total Sales/);
  assert.match(renderer, /Total Payments/);
  assert.match(renderer, /Current Balance/);
  assert.match(renderer, /Credit Limit/);
  assert.match(renderer, /Ledger Transactions/);
  assert.match(renderer, /Sales History/);
  assert.match(renderer, /Running Balance/);
  assert.match(renderer, /Balance Summary/);
  assert.match(renderer, /moneyClass\(row\.balance\)/);
});

test('Customer Ledger keeps unsupported payment workflow disabled and non-posting', () => {
  assert.match(
    renderer,
    /data-payment-unavailable disabled aria-disabled="true" title="Payment posting requires workflow completion"/
  );
  assert.match(renderer, /Payment posting requires workflow completion\./);
  assert.doesNotMatch(renderer, /function promptPayment\(/);
  assert.doesNotMatch(renderer, /dialog\.prompt\('Enter payment amount/);
  assert.doesNotMatch(renderer, /promptPayment\(Number\(pay\.dataset\.payCustomer\)\)/);
});

test('Customer Ledger layout removes sparse blank-panel geometry', () => {
  assert.match(
    css,
    /\.epos-customers-details\s*{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?overflow:\s*hidden;/
  );
  assert.match(css, /\.epos-ledger-hero-copy\s*{[\s\S]*?display:\s*grid;[\s\S]*?min-width:\s*0;/);
  assert.match(css, /\.epos-customers-details > :not\(\.epos-ledger-workspace\)/);
  assert.match(
    css,
    /\.epos-customers-details \.epos-ledger-hero-title\s*{[\s\S]*?color:\s*#ffffff;[\s\S]*?-webkit-text-fill-color:\s*#ffffff;/
  );
  assert.match(css, /\.epos-ledger-workspace\s*{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/);
  assert.match(
    css,
    /\.epos-ledger-main-grid\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 300px;/
  );
  assert.match(
    css,
    /\.epos-ledger-main-column\s*{[\s\S]*?grid-template-rows:\s*minmax\(0, 1\.35fr\) minmax\(156px, 0\.65fr\);/
  );
  assert.match(
    css,
    /\.epos-ledger-table-wrap\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow:\s*auto;/
  );
  assert.match(css, /\.epos-ledger-balance-panel\s*{[\s\S]*?overflow:\s*auto;/);
  assert.match(
    css,
    /@media \(max-width:\s*1180px\)\s*{[\s\S]*?\.epos-ledger-main-grid\s*{[\s\S]*?overflow:\s*auto;/
  );
  assert.match(
    css,
    /@media \(max-width:\s*1180px\)\s*{[\s\S]*?\.epos-ledger-transactions\s*{[\s\S]*?min-height:\s*210px;/
  );
  assert.match(
    css,
    /@media \(max-width:\s*1180px\)\s*{[\s\S]*?\.epos-ledger-main-grid \.epos-ledger-table th\s*{[\s\S]*?position:\s*static;/
  );
});

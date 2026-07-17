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

test('Customers consolidates customer-status tabs into one search-row dropdown', () => {
  const topbar =
    html.match(/<section class="epos-customers-topbar">[\s\S]*?<\/section>/)?.[0] || '';

  assert.doesNotMatch(topbar, /class="epos-customers-menu"|aria-label="Customer menu"/);
  assert.match(topbar, /id="customerPageSearch"/);
  assert.match(
    topbar,
    /id="customerFilterSelect" class="epos-customers-filter-select" aria-label="Customer Filter"[\s\S]*<option value="">All Customers<\/option>[\s\S]*<option value="active">Active Customers<\/option>[\s\S]*<option value="inactive">Inactive Customers<\/option>[\s\S]*<option value="vip">VIP Customers<\/option>[\s\S]*<option value="recent">Recent Customers<\/option>[\s\S]*<option value="regular">Regular Customers<\/option>[\s\S]*<option value="credit">Credit Customers<\/option>/
  );
  assert.match(topbar, /id="customerBulkActionsButton"/);

  const order = ['customerPageSearch', 'customerFilterSelect', 'customerBulkActionsButton'].map(
    (needle) => topbar.indexOf(needle)
  );
  assert.ok(
    order.every((index) => index >= 0),
    'all topbar controls are present'
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'search row order is stable'
  );

  assert.doesNotMatch(html, /epos-customers-tabs|epos-customers-tab-buttons|data-customer-tab/);
  assert.doesNotMatch(css, /\.epos-customers-tabs|\.epos-customers-tab-buttons|data-customer-tab/);
  assert.match(
    css,
    /\.epos-customers-topbar\s*{[\s\S]*?grid-template-columns:\s*minmax\(320px, 1fr\) 178px 148px;/
  );
  assert.match(
    css,
    /\.epos-customers-filter-select\s*{[\s\S]*?min-height:\s*38px;[\s\S]*?white-space:\s*nowrap;/
  );
});

test('Customers dropdown remains the single authoritative customer filter state', () => {
  assert.match(renderer, /let _currentTab = '';/);
  assert.match(renderer, /tab:\s*_currentTab/);
  assert.match(renderer, /function setActiveTab\(tab\)/);
  assert.match(renderer, /\$id\('customerFilterSelect'\)\?\.addEventListener\('change'/);
  assert.match(renderer, /setActiveTab\(event\.target\.value \|\| ''\)/);
  assert.match(renderer, /if \(select\) select\.value = tab;/);
  assert.match(renderer, /if \(select\) select\.value = _currentTab;/);
  assert.doesNotMatch(renderer, /querySelectorAll\('\[data-customer-tab\]'\)/);
});

test('Customers removed tab row and compacted footer return vertical space to table viewport', () => {
  const footerBlock = css.match(/\.epos-customers-footer\s*{[^}]*}/)?.[0] || '';
  const footerSpanBlock = css.match(/\.epos-customers-footer span\s*{[^}]*}/)?.[0] || '';
  const cardBlock = html.match(/<main class="epos-customers-card">[\s\S]*?<\/main>/)?.[0] || '';
  const footerMatches = html.match(/class="epos-customers-footer"/g) || [];
  assert.doesNotMatch(html, /<div class="epos-customers-tabs"|data-customer-tab/);
  assert.equal(footerMatches.length, 1);
  assert.match(
    css,
    /\.epos-customers-card\s*{[\s\S]*?display:\s*flex;[\s\S]*?height:\s*100%;[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*hidden;/
  );
  assert.match(
    css,
    /\.epos-customers-table-wrap\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/
  );
  assert.match(
    css,
    /\.epos-customers-footer\s*{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?flex:\s*0 0 24px;[\s\S]*?height:\s*24px;[\s\S]*?min-height:\s*24px;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*#eef3fb;[\s\S]*?padding:\s*4px 12px;[\s\S]*?font-size:\s*10px;[\s\S]*?line-height:\s*15px;/
  );
  assert.doesNotMatch(
    footerBlock,
    /background:\s*(?:#fff(?:fff)?|white|rgb\(255\s+255\s+255|rgb\(255,\s*255,\s*255)/i
  );
  assert.match(css, /\.epos-customers-footer span\s*{[\s\S]*?line-height:\s*15px;/);
  assert.doesNotMatch(footerBlock, /transform:\s*translateY/);
  assert.doesNotMatch(footerBlock, /margin-(?:top|bottom):\s*-/);
  assert.doesNotMatch(footerSpanBlock, /height:\s*100%;/);
  assert.match(
    css,
    /#dashboard #appMain #customersModule\s*{[\s\S]*?padding-bottom:\s*0;[\s\S]*?}/
  );
  assert.ok(
    cardBlock.indexOf('class="epos-customers-table-wrap"') >= 0 &&
      cardBlock.indexOf('class="epos-customers-footer"') >
        cardBlock.indexOf('class="epos-customers-table-wrap"'),
    'footer follows the table wrapper as the terminal card row'
  );
});

test('Customers removes dead search-row menu placeholder and keeps safe controls', () => {
  assert.doesNotMatch(html, /epos-customers-menu|Customer menu/);
  assert.doesNotMatch(css, /epos-customers-menu/);
  assert.doesNotMatch(renderer, /epos-customers-menu|Customer menu/);
  assert.match(html, /id="customerPageSearch"/);
  assert.match(html, /id="customerFilterSelect"/);
  assert.match(
    html,
    /id="customerBulkActionsButton" type="button" class="epos-customers-bulk-top" disabled aria-disabled="true"/
  );
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

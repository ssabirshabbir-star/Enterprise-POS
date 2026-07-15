const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const html = read('src/main/features/sales-history/index.html');
const renderer = read('src/main/features/sales-history/sales-history.renderer.js');
const login = read('src/renderer/scripts/login.js');

test('Completed Invoices keeps the shell title and removes the duplicate in-module title', () => {
  assert.match(login, /'\/sales-history':\s*{ title:\s*'Completed Invoices'/);
  assert.match(html, /class="epos-sales-history-kicker"[\s\S]*?>Sales History<\/p>/);
  assert.doesNotMatch(html, /<h2[^>]*>\s*Completed Invoices\s*<\/h2>/);
});

test('Completed Invoices uses the accepted compact route shell spacing', () => {
  assert.match(
    html,
    /#dashboard #appMain:has\(#salesHistoryModule:not\(\.hidden\)\)\s*{[\s\S]*?padding:\s*5px 8px 8px !important;[\s\S]*?scrollbar-gutter:\s*auto;/
  );
  assert.match(
    html,
    /\.epos-sales-history-page\s*{[\s\S]*?height:\s*100%;[\s\S]*?gap:\s*8px;[\s\S]*?overflow:\s*hidden;/
  );
  assert.doesNotMatch(html, /height:100%;padding:18px/);
});

test('Completed Invoices keeps filters, actions, and invoice hooks intact', () => {
  for (const id of [
    'salesHistoryReloadButton',
    'salesHistoryResetButton',
    'salesHistorySearch',
    'salesHistoryFromDate',
    'salesHistoryToDate',
    'salesHistoryStatus',
    'salesHistoryPaymentMethod',
    'salesHistoryList',
    'salesHistoryResultSummary',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(renderer, /data-view-sale=/);
  assert.match(renderer, /data-print-sale=/);
  assert.match(
    renderer,
    /addListener\(\$id\('salesHistoryReloadButton'\), 'click', handleReloadClick\)/
  );
  assert.match(renderer, /addListener\(\$id\('salesHistoryResetButton'\), 'click', resetFilters\)/);
});

test('Completed Invoices centers all invoice table header labels only', () => {
  const headerBlock = html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] || '';
  for (const label of ['Invoice', 'Date', 'Customer', 'Payment', 'Total', 'Status', 'Action']) {
    assert.match(
      headerBlock,
      new RegExp(`<th style="[^"]*text-align:center[^"]*"[^>]*>${label}<\\/th>`)
    );
  }

  assert.match(renderer, /<td style="padding:9px;text-align:right;font-weight:800">/);
  assert.match(renderer, /<td style="padding:9px;text-align:center;white-space:nowrap">/);
});

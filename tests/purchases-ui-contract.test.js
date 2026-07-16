const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const htmlPath = path.join(repoRoot, 'src/main/features/purchases/index.html');
const cssPath = path.join(repoRoot, 'src/main/features/purchases/purchases.css');
const rendererPath = path.join(repoRoot, 'src/main/features/purchases/purchases.renderer.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('Purchases keeps top dashboard statistics and removes duplicated footer summary', () => {
  const html = read(htmlPath);
  const renderer = read(rendererPath);
  const footerBlock =
    html.match(/<section class="epos-purchases-footer"[\s\S]*?<\/section>/)?.[0] || '';
  const statsBlock =
    html.match(/<section class="epos-purchases-stats"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(statsBlock, /Total Purchases/);
  assert.match(statsBlock, /Total Spend/);
  assert.match(statsBlock, /Pending Bills/);
  assert.match(statsBlock, /Paid Bills/);
  assert.match(statsBlock, /Overdue Tracking/);

  assert.doesNotMatch(footerBlock, /<article>|purchaseFooterCount|purchaseFooterTotal/);
  assert.doesNotMatch(footerBlock, /Total Amount|Paid Amount|Due Amount/);
  assert.doesNotMatch(renderer, /purchaseFooter(?:Count|Total|Paid|Due)/);
});

test('Purchases stat cards use the finalized neutral card treatment', () => {
  const css = read(cssPath);

  assert.match(
    css,
    /\.epos-purchases-stats article\s*{[\s\S]*?grid-template-columns:\s*38px minmax\(0, 1fr\);[\s\S]*?border-radius:\s*14px;[\s\S]*?border:\s*1px solid #edf0fb;[\s\S]*?background:\s*rgb\(255 255 255 \/ 0\.94\);/
  );
  assert.match(css, /\.epos-purchases-stats article::after\s*{[\s\S]*?content:\s*none;/);
  assert.match(css, /\.epos-purchases-stats \.blue > span/);
  assert.match(css, /\.epos-purchases-stats \.green > span/);
  assert.match(css, /\.epos-purchases-stats \.orange > span/);
  assert.doesNotMatch(
    css,
    /\.epos-purchases-stats \.(?:blue|green|orange|purple|pink)\s*{\s*background:\s*linear-gradient/
  );
});

test('Purchases footer preserves pagination controls only', () => {
  const html = read(htmlPath);
  const css = read(cssPath);
  const footerBlock =
    html.match(/<section class="epos-purchases-footer"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(footerBlock, /id="purchaseRowsPerPage"/);
  assert.match(footerBlock, /id="purchasePageInfo"/);
  assert.match(footerBlock, /id="purchasePrevPage"/);
  assert.match(footerBlock, /id="purchaseCurrentPage"/);
  assert.match(footerBlock, /id="purchaseNextPage"/);
  assert.match(css, /\.epos-purchases-footer\s*{[\s\S]*?display:\s*flex;/);
  assert.doesNotMatch(css, /epos-purchases-footer article|epos-purchases-footer strong/);
});

test('Purchases exposes only certified filter controls', () => {
  const html = read(htmlPath);
  const renderer = read(rendererPath);

  assert.match(html, /class="epos-purchases-filter-row"/);
  assert.match(html, /id="purchaseSupplierFilter"/);
  assert.match(
    html,
    /id="purchaseMethodFilter"[\s\S]*<option value="Cash">Cash<\/option>[\s\S]*<option value="Credit">Credit<\/option>/
  );
  assert.doesNotMatch(html, /Bank Transfer|Cheque/);
  assert.match(
    html,
    /id="purchasePaymentFilter"[\s\S]*<option value="PAID">Paid<\/option>[\s\S]*<option value="PARTIAL">Partial<\/option>[\s\S]*<option value="UNPAID">Unpaid<\/option>/
  );
  assert.match(html, /id="purchaseDateFilterMenu" class="epos-purchases-date-menu"/);
  assert.match(html, /id="purchaseDateFilterSummary">Date &amp; Due Filters<\/summary>/);
  assert.match(html, /id="purchaseFilterFrom" type="date"/);
  assert.match(html, /id="purchaseFilterTo" type="date"/);
  assert.match(html, /data-purchase-range="today"(?![^>]*disabled)/);
  assert.match(html, /data-purchase-range="last-month"(?![^>]*disabled)/);
  assert.match(html, /data-purchase-range="year"[^>]*disabled/);
  assert.match(html, /data-purchase-payment-shortcut="OVERDUE"[^>]*disabled/);
  assert.match(html, /id="purchaseDueTodayButton"[^>]*disabled/);
  assert.equal((html.match(/data-purchase-range="today"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="epos-purchases-search-row"/);
  assert.match(html, /id="purchaseClearDateFiltersButton"/);
  assert.match(html, /id="purchaseClearFiltersButton"[\s\S]*Reset All Filters/);
  assert.doesNotMatch(html, /id="purchaseRowsPerPage"[^>]*disabled/);

  assert.match(renderer, /A\(\)\.list\(getFilters\(\)\)/);
  assert.doesNotMatch(renderer, /function filteredPurchases/);
  assert.match(renderer, /purchasePagination/);
  assert.match(renderer, /function clearDateFilters/);
  assert.match(renderer, /function updateDateFilterSummary/);
});

test('Purchases consolidated filter row gives search the right-side workspace', () => {
  const html = read(htmlPath);
  const css = read(cssPath);
  const filterRow =
    html.match(/<div class="epos-purchases-filter-row">[\s\S]*?<\/div>\s*<\/section>/)?.[0] || '';

  assert.match(
    filterRow,
    /purchaseSupplierFilter[\s\S]*purchaseMethodFilter[\s\S]*purchasePaymentFilter[\s\S]*purchaseDateFilterMenu[\s\S]*purchaseKeywordSearch/
  );
  assert.match(
    css,
    /\.epos-purchases-filter-row\s*{[\s\S]*?grid-template-columns:\s*118px 112px 142px 188px minmax\(340px, 1fr\);/
  );
  assert.match(css, /\.epos-purchases-date-panel\s*{[\s\S]*?position:\s*absolute;/);
  assert.match(css, /\.epos-purchases-keyword\s*{[\s\S]*?justify-self:\s*stretch;/);
  assert.doesNotMatch(css, /\.epos-purchases-search-row\s*{/);
});

test('Purchases date and due filter dropdown preserves disabled unique options', () => {
  const html = read(htmlPath);
  const dateMenu = html.match(/<details id="purchaseDateFilterMenu"[\s\S]*?<\/details>/)?.[0] || '';

  for (const range of ['today', 'yesterday', '7', '30', 'month', 'last-month']) {
    assert.match(dateMenu, new RegExp(`data-purchase-range="${range}"(?![^>]*disabled)`));
  }
  assert.match(dateMenu, /data-purchase-range="year"[^>]*disabled/);
  assert.match(dateMenu, /data-purchase-payment-shortcut="OVERDUE"[^>]*disabled/);
  assert.match(dateMenu, /id="purchaseDueTodayButton"[^>]*disabled/);
  assert.match(dateMenu, /Overdue requires a certified purchase due-date field/);
  assert.match(dateMenu, /Due Today requires a certified purchase due-date field/);
});

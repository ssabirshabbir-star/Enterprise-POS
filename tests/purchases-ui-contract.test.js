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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const billingHtmlPath = path.join(root, 'src', 'main', 'features', 'billing', 'index.html');
const billingRendererPath = path.join(
  root,
  'src',
  'main',
  'features',
  'billing',
  'billing.renderer.js'
);
const billingCssPath = path.join(root, 'src', 'Components', 'Billing', 'billing.css');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readHtml() {
  return fs.readFileSync(billingHtmlPath, 'latin1');
}

function readRenderer() {
  return fs.readFileSync(billingRendererPath, 'utf8');
}

function readCss() {
  return fs.readFileSync(billingCssPath, 'utf8');
}

test('Billing exposes exactly one visible Clear Cart action in the footer', () => {
  const html = readHtml();
  const clearCartLabels = html.match(/<strong>Clear Cart<\/strong>/g) || [];
  assert.equal(clearCartLabels.length, 1);
  assert.match(
    html,
    /<footer class="epos-invoice-bottom-actions">[\s\S]*<button id="clearCartButton" type="button" data-pos-shortcut="Ctrl\+Delete">[\s\S]*<strong>Clear Cart<\/strong><kbd>Ctrl\+Delete<\/kbd>[\s\S]*<\/footer>/
  );
  assert.doesNotMatch(
    html,
    /<div class="epos-invoice-unified-grid">[\s\S]*<strong>Clear Cart<\/strong>[\s\S]*<\/div>\s*<\/section>/
  );
  assert.doesNotMatch(html, /posSaveDraftButton/);
  assert.doesNotMatch(html, /Ctrl\+S/);
});

test('Billing renderer keeps one Clear Cart handler and removes Ctrl+S routing', () => {
  const renderer = readRenderer();
  assert.match(
    renderer,
    /getElementById\('clearCartButton'\)\?\s*\.addEventListener\('click', clearCartConfirmFromUI\)/
  );
  assert.match(renderer, /if \(e\.key === 'Delete'\) \{[\s\S]*clearCartConfirmFromUI\(\);/);
  assert.doesNotMatch(renderer, /posSaveDraftButton/);
  assert.doesNotMatch(renderer, /k === 's'/);
  assert.doesNotMatch(renderer, /holdSaleFromUI\(\);\s*return;\s*\}\s*if \(k === 'r'\)/);
});

test('Billing restores incomplete summary actions as disabled roadmap buttons', () => {
  const html = readHtml();
  const roadmapButtons = [
    ['data-payment-set="Mixed"', 'Split payment is not available yet.'],
    ['id="refundSaleButton"', 'Returns are not available yet.'],
    ['id="exchangeSaleButton"', 'Exchanges are not available yet.'],
  ];

  for (const [selector, title] of roadmapButtons) {
    const buttonMatch = html.match(
      new RegExp(`<button[^>]*${escapeRegExp(selector)}[^>]*>[\\s\\S]*?</button>`)
    );
    assert.ok(buttonMatch, `${selector} button should exist`);
    assert.match(buttonMatch[0], /\sdisabled(?:\s|>)/);
    assert.match(buttonMatch[0], /aria-disabled="true"/);
    assert.match(buttonMatch[0], new RegExp(`title="${escapeRegExp(title)}"`));
    assert.doesNotMatch(buttonMatch[0], /\shidden(?:\s|>)/);
    assert.doesNotMatch(buttonMatch[0], /aria-hidden="true"/);
  }
});

test('Billing keeps WhatsApp visible but disabled when the backend gate is incomplete', () => {
  const html = readHtml();
  const renderer = readRenderer();
  const buttonMatch = html.match(/<button id="posWhatsappButton"[\s\S]*?<\/button>/);
  assert.ok(buttonMatch);
  assert.match(buttonMatch[0], /\sdisabled(?:\s|>)/);
  assert.match(buttonMatch[0], /aria-disabled="true"/);
  assert.match(buttonMatch[0], /title="WhatsApp sharing is not available yet\."/);
  assert.match(buttonMatch[0], /<strong>WhatsApp<\/strong>/);
  assert.match(renderer, /WhatsApp sharing is not available yet\./);
});

test('Billing disabled buttons have a non-interactive visual contract', () => {
  const css = readCss();
  assert.match(css, /\.epos-invoice-bottom-actions button:disabled/);
  assert.match(css, /\.epos-invoice-bottom-actions button\[aria-disabled="true"\]/);
  assert.match(css, /\.epos-invoice-unified-grid button:disabled/);
  assert.match(css, /\.epos-invoice-unified-grid button\[aria-disabled="true"\]/);
  assert.match(css, /cursor:\s*not-allowed\s*!important/);
});

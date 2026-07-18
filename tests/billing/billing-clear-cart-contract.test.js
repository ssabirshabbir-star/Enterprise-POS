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
const billingCartPath = path.join(root, 'src', 'main', 'features', 'billing', 'billing.cart.js');
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

function readCart() {
  return fs.readFileSync(billingCartPath, 'utf8');
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
  assert.match(
    renderer,
    /\$id\('subtotalDiscountButton'\)\?\.addEventListener\('click', \(\) => \{[\s\S]*const el = \$id\('discountInput'\);/
  );
  assert.match(renderer, /if \(e\.key === 'Delete'\) \{[\s\S]*clearCartConfirmFromUI\(\);/);
  assert.doesNotMatch(renderer, /posSaveDraftButton/);
  assert.doesNotMatch(renderer, /k === 's'/);
  assert.doesNotMatch(renderer, /holdSaleFromUI\(\);\s*return;\s*\}\s*if \(k === 'r'\)/);
});

test('Billing cart footer uses semantic colors for Discount and Clear Cart actions', () => {
  const html = readHtml();
  const css = readCss();

  assert.match(
    html,
    /<button id="posSubtotalDiscountButton" type="button" data-pos-shortcut="F8">/
  );
  assert.match(
    html,
    /<button id="clearCartButton" type="button" data-pos-shortcut="Ctrl\+Delete">/
  );
  assert.match(
    css,
    /#posSubtotalDiscountButton\s*\{\s*--footer-top:\s*#ff9a21;\s*--footer-mid:\s*#f06f00;\s*--footer-bottom:\s*#b94900;\s*\}/
  );
  assert.match(
    css,
    /#clearCartButton\s*\{\s*--footer-top:\s*#ff5757;\s*--footer-mid:\s*#e9322f;\s*--footer-bottom:\s*#b91c1c;\s*\}/
  );
  assert.doesNotMatch(
    css,
    /#posSubtotalDiscountButton\s*\{[^}]*#ff5757|#posSubtotalDiscountButton\s*\{[^}]*#e9322f|#posSubtotalDiscountButton\s*\{[^}]*#b91c1c/
  );
  assert.doesNotMatch(css, /\.epos-invoice-bottom-actions button:nth-child\(3\)\s*\{[^}]*#ff5757/);
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

test('Billing cart uses compact lock indicators beside Unit Price instead of price text badges', () => {
  const cart = readCart();
  const css = readCss();

  assert.doesNotMatch(cart, />Price locked<\/span>/);
  assert.doesNotMatch(cart, />Price unlocked<\/span>/);
  assert.doesNotMatch(cart, />Unlock Price<\/button>/);
  assert.match(cart, /class="epos-cart-price-control"/);
  assert.match(cart, /data-cart-price="\$\{i\}"[\s\S]*class="epos-cart-discount/);
  assert.match(cart, /class="epos-cart-price-lock epos-cart-price-lock-policy"/);
  assert.match(cart, /class="epos-cart-price-lock epos-cart-price-lock-action"/);
  assert.match(cart, /class="epos-cart-price-lock epos-cart-price-lock-open"/);
  assert.match(cart, /class="epos-cart-lock-icon" viewBox="0 0 16 16"/);
  assert.match(cart, /class="epos-cart-lock-body"/);
  assert.match(cart, /class="epos-cart-lock-shackle"/);
  assert.match(cart, /class="epos-cart-lock-keyhole"/);
  assert.match(cart, /function renderLockIcon\(shacklePath\)/);
  assert.match(cart, /renderLockIcon\('M4\.75 7V5\.25a3\.25 3\.25 0 0 1 6\.5 0V7'\)/);
  assert.match(cart, /renderLockIcon\('M5 7V5\.15A3\.15 3\.15 0 0 1 10\.7 3\.3'\)/);
  assert.match(
    cart,
    /title="Price locked by product policy&#10;Price override is not allowed for this product\."/
  );
  assert.match(
    cart,
    /title="Price locked — authorized override available&#10;Click or press Ctrl\+L to request price override\."/
  );
  assert.match(cart, /title="Price editable — authorized override active"/);
  assert.match(
    cart,
    /if \(item\.allowSalePriceOverride === true\) \{[\s\S]*data-unlock-price="\$\{index\}"/
  );
  assert.match(
    cart,
    /return `<span class="epos-cart-price-lock epos-cart-price-lock-policy"[\s\S]*Price override is not allowed for this product\./
  );
  assert.match(
    css,
    /\.epos-cart-price-control\s*\{[\s\S]*?grid-template-columns:\s*var\(--epos-cart-qty-input-width\) 22px/
  );
  assert.match(css, /\.epos-cart-price-control\s*\{[\s\S]*?gap:\s*4px/);
  assert.match(css, /\.epos-cart-price-lock\s*\{[\s\S]*?width:\s*22px/);
  assert.match(css, /\.epos-cart-price-lock\s*\{[\s\S]*?height:\s*22px/);
  assert.match(css, /\.epos-cart-price-lock\s*\{[\s\S]*?padding:\s*4px/);
  assert.match(css, /\.epos-cart-lock-icon\s*\{[\s\S]*?width:\s*14px/);
  assert.match(css, /\.epos-cart-lock-icon\s*\{[\s\S]*?height:\s*14px/);
  assert.match(css, /\.epos-cart-lock-body\s*\{\s*fill:\s*currentColor;/);
  assert.match(css, /\.epos-cart-lock-shackle\s*\{[\s\S]*?stroke:\s*currentColor/);
  assert.match(css, /\.epos-cart-price-lock-policy\s*\{\s*color:\s*#9ca3af;/);
  assert.match(css, /\.epos-cart-price-lock-action\s*\{\s*color:\s*#2563eb;/);
  assert.match(css, /\.epos-cart-price-lock-open\s*\{\s*color:\s*#16a34a;/);
  assert.match(css, /\.epos-cart-price-lock-action\s*\{[\s\S]*?cursor:\s*pointer;/);
  assert.match(
    css,
    /\.epos-cart-price-lock-policy,[\s\S]*?\.epos-cart-price-lock-open\s*\{[\s\S]*?cursor:\s*default;/
  );
  assert.doesNotMatch(cart, /🔒|🔓/);
  assert.doesNotMatch(
    css,
    /\.epos-cart-price-lock-policy\s*\{[^}]*#dc2626|\.epos-cart-price-lock-action\s*\{[^}]*#16a34a/
  );
});

test('Billing cart row density is compact without hiding product identity or controls', () => {
  const cart = readCart();
  const css = readCss();
  const densityBlocks = [
    css.match(
      /\.epos-billing-shell\.epos-invoice-ui \.epos-invoice-cart td\s*\{[\s\S]*?\n  \}/
    )?.[0],
    css.match(
      /\.epos-billing-shell\.epos-invoice-ui \.epos-cart-product-name\s*\{[\s\S]*?\n  \}/
    )?.[0],
    css.match(
      /\.epos-billing-shell\.epos-invoice-ui \.epos-cart-product-sku\s*\{[\s\S]*?\n  \}/
    )?.[0],
    css.match(
      /\.epos-billing-shell\.epos-invoice-ui \.epos-cart-price-control\s*\{[\s\S]*?\n  \}/
    )?.[0],
  ].join('\n');

  assert.match(cart, /class="epos-cart-product-name"/);
  assert.match(cart, /class="epos-cart-product-sku"/);
  assert.match(css, /--epos-cart-cell-pad-y:\s*4px;/);
  assert.match(css, /\.epos-invoice-cart td\s*\{[\s\S]*?min-height:\s*40px !important;/);
  assert.match(css, /\.epos-cart-product-name\s*\{[\s\S]*?line-height:\s*1\.08;/);
  assert.match(css, /\.epos-cart-product-sku\s*\{[\s\S]*?line-height:\s*1\.05;/);
  assert.match(css, /\.epos-cart-qty button\s*\{[\s\S]*?width:\s*var\(--epos-cart-qty-btn-size\)/);
  assert.match(
    css,
    /\.epos-cart-qty input,[\s\S]*?\.epos-cart-discount\s*\{[\s\S]*?height:\s*var\(--epos-cart-qty-btn-size\)/
  );
  assert.doesNotMatch(densityBlocks, /translateY\(|margin-top:\s*-\d|margin-bottom:\s*-\d/);
});

test('Billing cart maintains one authoritative active row for mouse and keyboard workflow', () => {
  const cart = readCart();
  const renderer = readRenderer();
  const css = readCss();

  assert.match(cart, /activeRowIndex:\s*-1/);
  assert.match(cart, /function getCartScrollContainer\(\)/);
  assert.match(cart, /function scrollCartRowIntoView\(index\)/);
  assert.match(cart, /function getActiveCartRowIndex\(\)/);
  assert.match(cart, /function setActiveCartRow\(index, options = \{\}\)/);
  assert.match(cart, /function moveActiveCartRow\(delta\)/);
  assert.match(cart, /class="\$\{i === activeRowIndex \? 'epos-cart-row-active' : ''\}"/);
  assert.match(cart, /aria-selected="\$\{i === activeRowIndex\}"/);
  assert.match(cart, /getCart\(\)\.activeRowIndex = -1/);
  assert.match(
    renderer,
    /const row = e\.target\.closest\('\[data-cart-row\]'\);[\s\S]*C\(\)\.setActiveCartRow\(Number\(row\.dataset\.cartRow\)\);/
  );
  assert.match(
    renderer,
    /if \(e\.key === 'ArrowUp' \|\| e\.key === 'ArrowDown'\) \{[\s\S]*C\(\)\.moveActiveCartRow\(e\.key === 'ArrowDown' \? 1 : -1\);/
  );
  assert.match(cart, /setActiveCartRow\(base \+ delta, \{ scroll: true \}\)/);
  assert.match(cart, /const header = container\.querySelector\('thead th'\);/);
  assert.match(
    cart,
    /const effectiveTop =[\s\S]*Math\.max\(containerRect\.top, headerRect\.bottom\)/
  );
  assert.match(cart, /rowRect\.top < effectiveTop \+ visibilityMargin[\s\S]*nextScrollTop -=/);
  assert.match(
    cart,
    /rowRect\.bottom > effectiveBottom - visibilityMargin[\s\S]*nextScrollTop \+=/
  );
  assert.match(
    cart,
    /container\.scrollTop = Math\.max\(0, Math\.min\(maxScrollTop, nextScrollTop\)\);/
  );
  assert.match(cart, /row\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(renderer, /if \(!inInput && !e\.ctrlKey && !e\.altKey && !e\.metaKey\)/);
  assert.match(css, /tr\.epos-cart-row-active td\s*\{[\s\S]*background:\s*#eff6ff/);
  assert.match(css, /tr\.epos-cart-row-active td:first-child\s*\{[\s\S]*inset 4px 0 0 #2563eb/);
});

test('Billing Ctrl+L unlock shortcut reuses the existing price authorization flow', () => {
  const renderer = readRenderer();

  assert.match(
    renderer,
    /if \(!item \|\| item\.allowSalePriceOverride !== true\) \{[\s\S]*This product price is locked by product policy\.[\s\S]*return;\s*\}[\s\S]*const profile = await currentProfile\(\);/
  );
  assert.match(
    renderer,
    /if \(k === 'l'\) \{[\s\S]*const index = C\(\)\.getActiveCartRowIndex\?\.\(\);[\s\S]*unlockPriceFromUI\(index\);/
  );
  assert.match(renderer, /if \(k === 'b'\)/);
  assert.match(renderer, /if \(k === 'w'\)/);
  assert.doesNotMatch(renderer, /if \(k === 'l'\)[\s\S]*openPriceUnlockReason\(/);
});

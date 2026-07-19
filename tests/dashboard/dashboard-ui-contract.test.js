const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const htmlPath = path.join(repoRoot, 'src/main/features/dashboard/index.html');
const cssPath = path.join(repoRoot, 'src/main/features/dashboard/dashboard.css');
const rendererPath = path.join(repoRoot, 'src/renderer/dashboard/dashboard.renderer.js');

const removedIds = [
  'dashboardMiniSales',
  'dashboardMiniProfit',
  'dashboardMiniOrders',
  'dashboardMiniCustomers',
  'dashboardAverageOrder',
  'dashboardComparisonChart',
  'dashboardProductCount',
  'dashboardSupplierCount',
  'dashboardExpenseTotal',
  'dashboardTodayPurchases',
  'dashboardPurchaseTotal',
  'dashboardOpenReturns',
  'dashboardPendingPurchaseOrders',
  'dashboardLuckyDrawCount',
  'dashboardCustomerCount',
  'dashboardCustomerDueLabel',
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('Dashboard markup keeps concise operational sections and removes duplicate KPI surfaces', () => {
  const html = read(htmlPath);

  for (const id of [
    'dashboardTodaySales',
    'dashboardProfitTotal',
    'dashboardOrderCount',
    'dashboardReceivableTotal',
    'dashboardLowStockCount',
    'dashboardOutOfStockCount',
    'dashboardStockValue',
    'dashboardSalesChart',
    'dashboardPaymentMethods',
    'dashboardTopProducts',
    'dashboardRecentSales',
    'dashboardCategorySales',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should remain visible or renderable`);
  }

  for (const id of removedIds) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${id} should be removed`);
  }

  assert.doesNotMatch(html, /epos-dashboard-mini-kpis|epos-dashboard-bottom-kpis/);
  assert.doesNotMatch(html, /Sales Comparison|dashboardComparisonChart/);
});

test('Dashboard stylesheet no longer carries removed section selectors', () => {
  const css = read(cssPath);

  assert.doesNotMatch(css, /epos-dashboard-mini-kpis|epos-dashboard-bottom-kpis/);
  assert.doesNotMatch(css, /epos-dashboard-bars|epos-dashboard-bar\b/);
  assert.match(css, /grid-template-rows:\s*auto auto minmax\(0, 1\.08fr\) minmax\(0, 0\.92fr\)/);
});

test('Dashboard renderer does not query or write removed dashboard IDs', () => {
  const source = read(rendererPath);

  for (const id of removedIds) {
    assert.doesNotMatch(source, new RegExp(id), `${id} should not be referenced by renderer`);
  }

  const requestedIds = [];
  const elements = new Map();
  const document = {
    getElementById(id) {
      requestedIds.push(id);
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '' });
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
  };
  const window = {
    EposUI: null,
    FeatureGate: { check: () => ({ ok: true }) },
  };

  vm.runInNewContext(source, {
    console,
    document,
    window,
    setInterval: () => 1,
    clearInterval: () => {},
  });

  window.DashboardRenderer.renderUI({
    stats: {
      todaySales: 1234.5,
      totalProfit: 250,
      todayOrders: 4,
      customerDueTotal: 90,
      lowStockCount: 2,
      outOfStockCount: 1,
      stockValue: 777,
    },
    salesTrend: [{ total: 1234.5 }],
    recentSales: [{ invoiceNumber: 'INV-1', grandTotal: 1234.5, paymentMethod: 'Cash' }],
    topProducts: [{ name: 'Rice', total: 500 }],
    paymentMethods: [{ method: 'Cash', total: 1234.5 }],
    categorySales: [{ category: 'Grocery', total: 1234.5 }],
  });

  for (const id of removedIds) {
    assert.equal(requestedIds.includes(id), false, `${id} should not be queried`);
  }
  assert.equal(elements.get('dashboardReceivableTotal').textContent, 'Rs. 90.00');
  assert.equal(elements.get('dashboardOutOfStockCount').textContent, '1');
  assert.equal(elements.get('dashboardStockValue').textContent, 'Rs. 777.00');
});

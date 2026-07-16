const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function loadDashboardRenderer() {
  const source = read('src/renderer/dashboard/dashboard.renderer.js');
  const ids = [
    'dashboardTodaySales',
    'dashboardProfitTotal',
    'dashboardOrderCount',
    'dashboardLowStockCount',
    'dashboardStockValue',
    'dashboardReceivableTotal',
    'dashboardOutOfStockCount',
    'dashboardReportDate',
    'dashboardGreeting',
    'dashboardUserName',
    'dashboardUserRole',
    'dashboardRecentSales',
    'dashboardLowStock',
    'dashboardSalesChart',
    'dashboardTopProducts',
    'dashboardPaymentMethods',
    'dashboardPaymentTotal',
    'dashboardCategorySales',
    'dashboardCategoryTotal',
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        innerHTML: '',
        textContent: '',
        addEventListener() {},
      },
    ])
  );
  const context = {
    window: {
      FeatureGate: { check: () => ({ ok: true }) },
      EposUI: null,
      setInterval: () => 1,
      clearInterval() {},
      posApi: { dashboard: { overview: async () => ({ ok: true }) } },
    },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
    },
    console,
  };
  context.window.window = context.window;
  vm.runInNewContext(source, context);
  return { renderer: context.window.DashboardRenderer, elements };
}

test('Dashboard keeps the existing functional DOM contract', () => {
  const html = read('src/main/features/dashboard/index.html');

  [
    'dashboardReportDate',
    'dashboardRefreshButton',
    'dashboardTodaySales',
    'dashboardProfitTotal',
    'dashboardOrderCount',
    'dashboardReceivableTotal',
    'dashboardLowStockCount',
    'dashboardOutOfStockCount',
    'dashboardStockValue',
    'dashboardSalesChart',
    'dashboardPaymentTotal',
    'dashboardPaymentMethods',
    'dashboardTopProducts',
    'dashboardRecentSales',
    'dashboardCategoryTotal',
    'dashboardCategorySales',
  ].forEach((id) => assert.match(html, new RegExp(`id="${id}"`), `${id} must remain`));

  assert.match(html, /Executive overview/);
  assert.match(html, /epos-dashboard-mix-total/);
  assert.match(html, /epos-dashboard-share-list/);
  assert.doesNotMatch(html, /epos-dashboard-donut/);
  assert.match(html, /data-route="\/reports"/);
  assert.match(html, /data-route="\/sales-history"/);
  assert.match(html, /id="dashboardExportButton"[^>]*disabled[^>]*hidden/);
});

test('Dashboard responsive CSS uses proportional desktop geometry without fixed page widths', () => {
  const css = read('src/main/features/dashboard/dashboard.css');

  assert.match(css, /#dashboard #appMain:has\(#dashboardRoute:not\(\.hidden\)\)/);
  assert.match(
    css,
    /\.epos-dashboard-page\s*{[\s\S]*grid-template-rows:\s*auto auto minmax\(0, 1\.08fr\) minmax\(0, 0\.92fr\)/
  );
  assert.match(
    css,
    /\.epos-dashboard-kpis\s*{[\s\S]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/
  );
  assert.match(css, /\.epos-dashboard-kpis article\s*{[\s\S]*min-height:\s*clamp\(/);
  assert.match(
    css,
    /\.epos-dashboard-grid-top\s*{[\s\S]*grid-template-columns:\s*minmax\(360px, 1\.35fr\)/
  );
  assert.match(
    css,
    /\.epos-dashboard-grid-bottom\s*{[\s\S]*grid-template-columns:\s*minmax\(420px, 1\.45fr\)/
  );
  assert.match(css, /\.epos-dashboard-mix-panel\s*{/);
  assert.match(css, /\.epos-dashboard-share-track\s*{/);
  assert.match(css, /\.epos-dashboard-share-track i\s*{/);
  assert.doesNotMatch(css, /epos-dashboard-donut/);
  assert.match(css, /@media \(max-width: 1366px\)/);
  assert.doesNotMatch(css, /width:\s*100vw/);
  assert.doesNotMatch(css, /transform:\s*translate/);
  assert.doesNotMatch(css, /margin-left:\s*-/);
  assert.doesNotMatch(css, /margin-right:\s*-/);
});

test('Dashboard renderer keeps data calculations delegated to dashboard API', () => {
  const renderer = read('src/renderer/dashboard/dashboard.renderer.js');
  const service = read('src/main/features/dashboard/dashboard.service.js');
  const repository = read('src/main/features/dashboard/dashboard.repository.js');

  assert.match(renderer, /window\.posApi\.dashboard\.overview\(\)/);
  assert.match(renderer, /function renderShareRows/);
  assert.match(renderer, /No sales in the selected week yet\./);
  assert.doesNotMatch(renderer, /getPool|SELECT|INSERT|UPDATE|DELETE/);
  assert.match(service, /dashboardRepository\.getOverviewData\(\)/);
  assert.match(repository, /async function getOverviewData\(\)/);
});

test('Dashboard renderer shows truthful empty states and labeled valid sales trend', () => {
  const { renderer, elements } = loadDashboardRenderer();

  renderer.renderUI({
    ok: true,
    stats: {},
    salesTrend: [
      { saleDate: '2026-07-09', total: 0 },
      { saleDate: '2026-07-10', total: 0 },
    ],
    paymentMethods: [{ method: 'Cash', total: 0 }],
    categorySales: [{ category: 'Grocery', total: 0 }],
    topProducts: [],
    recentSales: [
      {
        invoiceNumber: 'POS-HPELITED-20260712-001',
        customerName: 'Walk-in Customer',
        grandTotal: 80,
        paymentMethod: 'Cash',
      },
    ],
  });

  assert.match(elements.dashboardSalesChart.innerHTML, /No sales in the selected week yet\./);
  assert.doesNotMatch(elements.dashboardSalesChart.innerHTML, /epos-dashboard-line-bar/);
  assert.match(elements.dashboardPaymentMethods.innerHTML, /No payments recorded today\./);
  assert.match(elements.dashboardCategorySales.innerHTML, /No category sales today\./);
  assert.match(elements.dashboardTopProducts.innerHTML, /No products sold today\./);
  assert.match(elements.dashboardRecentSales.innerHTML, /title="POS-HPELITED-20260712-001"/);

  renderer.renderUI({
    ok: true,
    stats: {},
    salesTrend: [
      { date: '2026-07-09', total: 100 },
      { date: '2026-07-10', total: 50 },
    ],
    paymentMethods: [{ method: 'Cash', total: 75 }],
    categorySales: [{ category: 'Grocery', total: 75 }],
    topProducts: [{ name: 'Apples 1kg', quantity: 3, total: 75 }],
    recentSales: [],
  });

  assert.match(elements.dashboardSalesChart.innerHTML, /epos-dashboard-line-point/);
  assert.match(elements.dashboardSalesChart.innerHTML, /epos-dashboard-line-bar/);
  assert.match(elements.dashboardSalesChart.innerHTML, /<em>/);
  assert.doesNotMatch(elements.dashboardSalesChart.innerHTML, /<em>-<\/em>/);
  assert.match(elements.dashboardSalesChart.innerHTML, /title="[^"]+ - Rs\./);
  assert.match(elements.dashboardPaymentMethods.innerHTML, /epos-dashboard-share-row/);
  assert.match(elements.dashboardCategorySales.innerHTML, /epos-dashboard-share-row/);
  assert.match(elements.dashboardTopProducts.innerHTML, /3 sold/);
});

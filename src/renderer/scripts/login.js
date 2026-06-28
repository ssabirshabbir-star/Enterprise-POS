// ============================================================
// Enterprise POS — Renderer Controller
// ============================================================

// ---- DOM References ----------------------------------------
const loadingScreen = document.getElementById('loadingScreen');
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginUsernameInput = document.getElementById('username');
const loginPasswordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('message');
const signedInUser = document.getElementById('signedInUser');
const logoutButton = document.getElementById('logoutButton');
const routeTitle = document.getElementById('routeTitle');
const routePanels = document.querySelectorAll('[data-route-panel]');

// ---- App State ---------------------------------------------
let currentProfile = null;

const routeMeta = {
  '/dashboard': { title: 'Dashboard', module: 'dashboard' },
  '/pos': { title: 'Billing', module: 'pos' },
  '/sales-history': { title: 'Completed Invoices', module: 'pos' },
  '/products': { title: 'Products', module: 'products' },
  '/inventory': { title: 'Inventory', module: 'inventory' },
  '/purchases': { title: 'Purchases', module: 'purchases' },
  '/purchase-orders': { title: 'Purchase Orders', module: 'purchase_orders' },
  '/suppliers': { title: 'Suppliers', module: 'suppliers' },
  '/customers': { title: 'Customers', module: 'customers' },
  '/returns': { title: 'Returns', module: 'returns' },
  '/reports': { title: 'Reports', module: 'reports' },
  '/expenses': { title: 'Expenses', module: 'expenses' },
  '/lucky-draw': { title: 'Lucky Draw', module: 'lucky_draw' },
  '/users': { title: 'User Management', module: 'users' },
  '/settings': { title: 'Settings', module: 'settings' },
  '/sync': { title: 'Sync Queue', module: 'sync' },
};

// ---- Module → Permission Key Map (mirrors backend rbac.js ROUTE_PERMISSIONS) ----
// Used by applySidebarVisibility() to filter the sidebar using existing profile.permissions[].
// Never invent new keys here — only use permission_keys that exist in the DB permissions table.
const MODULE_PERMISSIONS = Object.freeze({
  dashboard: 'dashboard.view',
  pos: 'pos.view',
  products: 'products.view',
  inventory: 'inventory.view',
  purchases: 'purchases.view',
  purchase_orders: 'purchaseOrders.view',
  suppliers: 'suppliers.view',
  customers: 'customers.view',
  returns: 'returns.view',
  reports: 'reports.view',
  expenses: 'expenses.view',
  lucky_draw: 'lucky_draw.view',
  users: 'users.view',
  settings: 'settings.view',
  sync: 'sync.view',
});

// ---- UI State Functions ------------------------------------

function setCheckingSession(active) {
  if (active) {
    loadingScreen.classList.remove('hidden');
    loginScreen.classList.add('hidden');
    dashboard.classList.add('hidden');
  } else {
    loadingScreen.classList.add('hidden');
  }
}

function setAuthUser(profile) {
  currentProfile = profile;
  if (signedInUser && profile) {
    const label = profile.fullName
      ? `${profile.fullName} (${profile.role})`
      : profile.username || 'User';
    signedInUser.textContent = label;
    signedInUser.title = label;
  }
}

function showLogin() {
  loadingScreen.classList.add('hidden');
  dashboard.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  setTimeout(() => loginUsernameInput?.focus(), 50);
}

// Apply role-based sidebar visibility using existing profile.permissions[].
// Hides any sidebar item whose required permission is not in the user's permission list.
// Dashboard is always visible as the safe fallback — never hidden.
function applySidebarVisibility(profile) {
  const permissions = Array.isArray(profile?.permissions) ? profile.permissions : [];
  document.querySelectorAll('#sidebarNav [data-module]').forEach((btn) => {
    const mod = btn.dataset.module;
    if (mod === 'dashboard') {
      btn.classList.remove('hidden'); // always accessible
      return;
    }
    const required = MODULE_PERMISSIONS[mod];
    const allowed = required ? permissions.includes(required) : false;
    btn.classList.toggle('hidden', !allowed);
  });
}

function showDashboard(profile) {
  setAuthUser(profile);
  applySidebarVisibility(profile);
  loadingScreen.classList.add('hidden');
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  navigateTo('/pos').catch(() => {});
}

// ---- Routing -----------------------------------------------

function hideAllPanels() {
  routePanels.forEach((panel) => panel.classList.add('hidden'));
}

function setNavActive(route) {
  const meta = routeMeta[route];
  if (routeTitle) routeTitle.textContent = meta?.title || '';
  document.querySelectorAll('.navLink[data-route]').forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle('epos-sidebar-item-active', active);
  });
}

// Lazy-load each fragment HTML once
const fragmentCache = new Set();

async function loadFragment(panel) {
  const src = panel.dataset.fragment;
  if (!src || fragmentCache.has(src) || panel.children.length > 0) return;
  fragmentCache.add(src);
  try {
    const res = await fetch(src);
    if (res.ok) panel.innerHTML = await res.text();
  } catch (_) {
    // fragment unavailable — leave panel empty, do not crash
  }
}

async function navigateTo(route) {
  const target = routeMeta[route] ? route : '/dashboard';
  const meta = routeMeta[target];

  // Access check via IPC — FAIL CLOSED: any error or denial blocks navigation
  if (target !== '/dashboard') {
    try {
      const access = await window.posApi.auth.canAccess(meta.module);
      if (!access?.allowed) {
        console.warn(`[Nav] Access denied for module "${meta.module}" — redirecting to dashboard.`);
        return navigateTo('/dashboard');
      }
    } catch (err) {
      // canAccess IPC failed (DB down, process error) — deny and redirect, never allow
      console.warn(`[Nav] canAccess() threw for module "${meta.module}" — failing closed.`, err);
      return navigateTo('/dashboard');
    }
  }

  hideAllPanels();
  const panel = document.querySelector(`[data-route-panel="${target}"]`);
  if (panel) {
    panel.classList.remove('hidden');
    await loadFragment(panel);
  }
  setNavActive(target);

  if (target === '/dashboard') {
    loadDashboardStats().catch(() => {});
  }

  if (target === '/pos') {
    window.initBillingModule?.();
  }

  if (target === '/sales-history') {
    window.initSalesHistoryModule?.();
  }

  if (target === '/products') {
    window.initProductsModule?.();
  }

  if (target === '/customers') {
    window.initCustomersModule?.();
  }

  if (target === '/lucky-draw') {
    window.initLuckyDrawV2Module?.();
  }

  if (target === '/suppliers') {
    window.initSuppliersModule?.();
  }

  if (target === '/inventory') {
    window.initInventoryModule?.();
  }

  if (target === '/purchases') {
    window.initPurchasesModule?.();
  }

  if (target === '/returns') {
    window.initReturnsModule?.();
  }
}

// ---- Dashboard Stats ---------------------------------------

function $setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function $money(v) {
  return `Rs. ${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function loadDashboardStats() {
  if (!window.posApi?.dashboard?.overview) return;
  try {
    const result = await window.posApi.dashboard.overview();
    if (!result?.ok) return;

    const stats = result.stats || {};
    const recentSales = result.recentSales || [];
    const lowStock = result.lowStock || [];
    const topProducts = result.topProducts || [];
    const paymentMethods = result.paymentMethods || [];
    const categorySales = result.categorySales || [];

    // ── KPI cards ────────────────────────────────────────────────────────────
    $setText('dashboardTodaySales', $money(stats.todaySales));
    $setText('dashboardProfitTotal', $money(stats.totalProfit));
    $setText('dashboardOrderCount', Number(stats.todayOrders || 0).toLocaleString());
    $setText('dashboardCustomerDue', $money(stats.customerDueTotal));
    $setText('dashboardLowStockCount', Number(stats.lowStockCount || 0).toLocaleString());
    $setText('dashboardPurchaseTotal', $money(stats.duePurchases ?? stats.todayPurchases ?? 0));
    $setText('dashboardProductCount', Number(stats.productCount || 0).toLocaleString());
    $setText('dashboardStockValue', $money(stats.stockValue));
    $setText('dashboardSupplierCount', Number(stats.supplierCount || 0).toLocaleString());
    $setText('dashboardExpenseTotal', $money(stats.todayExpenses));
    $setText('dashboardReceivableTotal', $money(stats.customerDueTotal));
    $setText('dashboardMiniSales', $money(stats.todaySales));
    $setText('dashboardMiniProfit', $money(stats.totalProfit));
    $setText('dashboardMiniOrders', Number(stats.todayOrders || 0).toLocaleString());
    $setText('dashboardMiniCustomers', Number(stats.customersWithDue || 0).toLocaleString());
    $setText('dashboardReportDate', new Date().toLocaleDateString());

    // Average Order Value — computed client-side from existing stats, no new query needed
    const avgOrder =
      stats.todayOrders > 0 ? Number(stats.todaySales || 0) / Number(stats.todayOrders) : 0;
    $setText('dashboardAverageOrder', $money(avgOrder));

    // Hidden personalization spans (IDs present in dashboard/index.html hidden-feeds section)
    $setText(
      'dashboardGreeting',
      `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, ${currentProfile?.fullName || currentProfile?.username || 'Admin'}`
    );
    $setText('dashboardUserName', currentProfile?.fullName || currentProfile?.username || '-');
    $setText('dashboardUserRole', currentProfile?.role || '-');

    // ── Recent sales table ────────────────────────────────────────────────────
    const salesEl = document.getElementById('dashboardRecentSales');
    if (salesEl) {
      salesEl.innerHTML =
        recentSales
          .map(
            (s) =>
              `<div><span>${s.invoiceNumber || '-'}</span><span>${s.customerName || 'Walk-in'}</span>` +
              `<strong>${$money(s.grandTotal)}</strong><span>${s.paymentMethod || 'Cash'}</span></div>`
          )
          .join('') || '<p class="text-zinc-500">No sales yet.</p>';
    }

    // ── Low stock list (hidden feeds — used by other parts) ───────────────────
    const lowEl = document.getElementById('dashboardLowStock');
    if (lowEl) {
      lowEl.innerHTML =
        lowStock
          .map(
            (i) =>
              `<div class="flex justify-between"><span>${i.name}</span>` +
              `<strong>${i.currentStock}/${i.minStockLevel}</strong></div>`
          )
          .join('') || '<p class="text-zinc-500">No low stock items.</p>';
    }

    // ── Sales sparkline chart ─────────────────────────────────────────────────
    const chart = document.getElementById('dashboardSalesChart');
    if (chart && recentSales.length) {
      const vals = recentSales
        .slice(0, 7)
        .map((s) => Number(s.grandTotal || 0))
        .reverse();
      const max = Math.max(...vals, 1);
      chart.innerHTML = vals
        .map(
          (v) =>
            `<span class="epos-dashboard-line-bar" style="height:${Math.max(8, Math.round((v / max) * 100))}%"></span>`
        )
        .join('');
    }

    // ── Top Selling Products ──────────────────────────────────────────────────
    const topEl = document.getElementById('dashboardTopProducts');
    if (topEl) {
      if (topProducts.length) {
        topEl.innerHTML = topProducts
          .map(
            (p, i) =>
              `<div><b>${i + 1}</b><span>${p.name}</span><strong>${$money(p.total)}</strong></div>`
          )
          .join('');
      } else {
        topEl.innerHTML =
          '<div style="color:#94a3b8;font-size:12px;padding:12px 0">No sales today.</div>';
      }
    }

    // ── Payment Methods legend ────────────────────────────────────────────────
    const payEl = document.getElementById('dashboardPaymentMethods');
    const payTotalEl = document.getElementById('dashboardPaymentTotal');
    if (payEl) {
      const payTotal = paymentMethods.reduce((s, m) => s + Number(m.total || 0), 0);
      if (payTotalEl) payTotalEl.textContent = $money(payTotal);
      if (paymentMethods.length) {
        payEl.innerHTML = paymentMethods
          .map((m) => `<div><span>${m.method}</span><strong>${$money(m.total)}</strong></div>`)
          .join('');
      } else {
        payEl.innerHTML =
          '<div style="color:#94a3b8;font-size:12px;padding:12px 0">No sales today.</div>';
      }
    }

    // ── Category Sales legend ─────────────────────────────────────────────────
    const catEl = document.getElementById('dashboardCategorySales');
    const catTotalEl = document.getElementById('dashboardCategoryTotal');
    if (catEl) {
      const catTotal = categorySales.reduce((s, c) => s + Number(c.total || 0), 0);
      if (catTotalEl) catTotalEl.textContent = $money(catTotal);
      if (categorySales.length) {
        catEl.innerHTML = categorySales
          .map((c) => `<div><span>${c.category}</span><strong>${$money(c.total)}</strong></div>`)
          .join('');
      } else {
        catEl.innerHTML =
          '<div style="color:#94a3b8;font-size:12px;padding:12px 0">No sales today.</div>';
      }
    }

    // ── Wire dashboard-internal "View All" buttons to navigation ─────────────
    // These buttons have data-route="/reports" but lack the navLink class used
    // by the global click delegation, so they are wired here on each load.
    document.querySelectorAll('#dashboardRoute [data-route]').forEach((btn) => {
      if (!btn._dashboardRouteWired) {
        btn._dashboardRouteWired = true;
        btn.addEventListener('click', () => navigateTo(btn.dataset.route).catch(() => {}));
      }
    });
  } catch (err) {
    console.warn('[Dashboard] Stats load failed:', err);
  }
}

// ---- Login Handler -----------------------------------------

function showLoginMessage(text) {
  if (!loginMessage) return;
  loginMessage.textContent = text;
  loginMessage.classList.remove('hidden');
}

function clearLoginMessage() {
  if (!loginMessage) return;
  loginMessage.textContent = '';
  loginMessage.classList.add('hidden');
}

loginButton?.addEventListener('click', async () => {
  const username = String(loginUsernameInput?.value || '').trim();
  const password = String(loginPasswordInput?.value || '');
  if (!username || !password) {
    showLoginMessage('Please enter username and password.');
    return;
  }
  clearLoginMessage();
  loginButton.disabled = true;
  try {
    const result = await window.posApi.auth.login({ username, password });
    if (result?.ok) {
      loginPasswordInput.value = '';
      showDashboard(result.profile);
    } else {
      showLoginMessage(result?.message || 'Login failed. Please try again.');
    }
  } catch (err) {
    console.error('[Login] Error:', err);
    showLoginMessage('Cannot connect. Please check the system.');
  } finally {
    loginButton.disabled = false;
  }
});

loginPasswordInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginButton?.click();
});

// ---- Logout ------------------------------------------------

logoutButton?.addEventListener('click', async () => {
  try {
    await window.posApi.auth.logout();
  } catch (_) {}
  currentProfile = null;
  // Reset sidebar to fully visible so the next login re-applies the correct role.
  document
    .querySelectorAll('#sidebarNav [data-module]')
    .forEach((btn) => btn.classList.remove('hidden'));
  showLogin();
});

// ---- Sidebar / Header Nav Delegation -----------------------

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route].navLink');
  if (!link || dashboard.classList.contains('hidden')) return;
  e.preventDefault();
  navigateTo(link.dataset.route).catch(() => {});
});

// ---- Session Restore (called by boot stub below) -----------

async function restoreSession() {
  try {
    setCheckingSession(true);
    const result = await window.posApi.auth.profile();
    if (result?.ok) {
      setAuthUser(result.profile);
      showDashboard(result.profile);
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('[restoreSession] Error:', err);
    showLogin();
  } finally {
    setCheckingSession(false);
  }
}

// ---- Boot --------------------------------------------------
restoreSession();

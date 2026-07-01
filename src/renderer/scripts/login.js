// ============================================================
// Enterprise POS - Renderer Controller
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

function applySidebarVisibility(profile) {
  const permissions = Array.isArray(profile?.permissions) ? profile.permissions : [];
  document.querySelectorAll('#sidebarNav [data-module]').forEach((btn) => {
    const mod = btn.dataset.module;
    if (mod === 'dashboard') {
      btn.classList.remove('hidden');
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

const fragmentCache = new Set();
let dashboardRendererLoadPromise = null;

async function loadFragment(panel) {
  const src = panel.dataset.fragment;
  if (!src || fragmentCache.has(src) || panel.children.length > 0) return;
  fragmentCache.add(src);
  try {
    const res = await fetch(src);
    if (res.ok) panel.innerHTML = await res.text();
  } catch {
    // fragment unavailable - leave panel empty, do not crash
  }
}

async function ensureDashboardRenderer() {
  if (window.DashboardRenderer) return window.DashboardRenderer;
  if (!dashboardRendererLoadPromise) {
    dashboardRendererLoadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = './dashboard/dashboard.renderer.js';
      script.onload = () => resolve(window.DashboardRenderer || null);
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  }
  return dashboardRendererLoadPromise;
}

async function navigateTo(route) {
  const target = routeMeta[route] ? route : '/dashboard';
  const meta = routeMeta[target];

  if (target !== '/dashboard') {
    try {
      const access = await window.posApi.auth.canAccess(meta.module);
      if (!access?.allowed) {
        return navigateTo('/dashboard');
      }
    } catch {
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
    const dashboardRenderer = await ensureDashboardRenderer();
    dashboardRenderer?.start({ profile: currentProfile, navigateTo });
  } else {
    window.DashboardRenderer?.destroyUI();
  }

  if (target === '/pos') window.initBillingModule?.();
  if (target === '/sales-history') window.initSalesHistoryModule?.();
  if (target === '/products') window.initProductsModule?.();
  if (target === '/customers') window.initCustomersModule?.();
  if (target === '/lucky-draw') window.initLuckyDrawV2Module?.();
  if (target === '/suppliers') window.initSuppliersModule?.();
  if (target === '/inventory') window.initInventoryModule?.();
  if (target === '/purchases') window.initPurchasesModule?.();
  if (target === '/purchase-orders') window.initPurchaseOrdersModule?.();
  if (target === '/returns') window.initReturnsModule?.();
  if (target === '/users') window.initAccessControlModule?.();
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
  } catch {
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
  } catch {}
  currentProfile = null;
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

// ---- Session Restore ---------------------------------------

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
  } catch {
    showLogin();
  } finally {
    setCheckingSession(false);
  }
}

// ---- Boot --------------------------------------------------
restoreSession();

(function renderEnterpriseFragments() {
  function fallbackTemplate() {
    return `
      <div class="grid gap-4 md:grid-cols-5">
        <article class="dashboard-stat-card dashboard-gradient-blue"><p class="text-xs font-bold text-white/80">Today Sales</p><p id="dashboardTodaySales" class="mt-2 text-2xl font-extrabold text-white">Rs. 0</p></article>
        <article class="dashboard-stat-card dashboard-gradient-purple"><p class="text-xs font-bold text-white/80">Products</p><p id="dashboardProductCount" class="mt-2 text-2xl font-extrabold text-white">0</p></article>
        <article class="dashboard-stat-card dashboard-gradient-orange"><p class="text-xs font-bold text-white/80">Low Stock</p><p id="dashboardLowStockCount" class="mt-2 text-2xl font-extrabold text-white">0</p></article>
        <article class="dashboard-stat-card dashboard-gradient-teal"><p class="text-xs font-bold text-white/80">Purchases</p><p id="dashboardPurchaseTotal" class="mt-2 text-2xl font-extrabold text-white">0</p></article>
        <article class="dashboard-stat-card dashboard-gradient-cyan"><p class="text-xs font-bold text-white/80">Customer Due</p><p id="dashboardCustomerDue" class="mt-2 text-2xl font-extrabold text-white">0</p></article>
      </div>
      <div class="mt-5 grid gap-5 xl:grid-cols-2">
        <section class="dashboard-panel"><h3 class="text-lg font-extrabold text-slate-900">Recent Sales</h3><div id="dashboardRecentSales" class="mt-3 dashboard-feed"></div></section>
        <section class="dashboard-panel"><h3 class="text-lg font-extrabold text-slate-900">Low Stock Alerts</h3><div id="dashboardLowStock" class="mt-3 dashboard-feed"></div></section>
        <section class="dashboard-panel"><h3 class="text-lg font-extrabold text-slate-900">Recent Activity</h3><div id="dashboardRecentActivity" class="mt-3 dashboard-feed"></div></section>
        <section class="dashboard-panel"><h3 class="text-lg font-extrabold text-slate-900">Protected Modules</h3><div id="moduleGrid" class="mt-3 grid gap-3 sm:grid-cols-2"></div></section>
      </div>
    `;
  }

  function loadTemplate(url, fallback = '') {
    const request = new XMLHttpRequest();
    request.open('GET', url, false);
    try {
      request.send(null);
      const loaded = (request.status >= 200 && request.status < 300) || (request.status === 0 && request.responseText);
      return loaded ? request.responseText : fallback;
    } catch {
      return fallback;
    }
  }

  document.querySelectorAll('[data-fragment]').forEach((mount) => {
    const fragmentPath = mount.getAttribute('data-fragment');
    if (!fragmentPath) return;
    const fallback = mount.id === 'dashboardRoute' ? fallbackTemplate() : '';
    const fragmentUrl = new URL(fragmentPath, window.location.href).toString();
    mount.innerHTML = loadTemplate(fragmentUrl, fallback);
    if (mount.id === 'dashboardRoute') {
      mount.className = 'dashboard-shell mx-auto max-w-7xl';
    }
  });
})();

/**
 * dashboard.renderer.js - Dashboard renderer owner
 *
 * RESPONSIBILITY: Dashboard DOM rendering, refresh lifecycle, and dashboard-local events.
 */
(function DashboardRendererModule() {
  'use strict';

  let refreshTimer = null;
  let loadPromise = null;
  let currentProfile = null;
  let navigate = null;
  const UIX = () => window.EposUI;

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

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderEmptyPanel(message) {
    if (UIX()?.Panel?.render) {
      return UIX().Panel.render({
        children: message,
        className: 'epos-dashboard-empty',
      });
    }
    return `<p class="epos-dashboard-empty">${esc(message)}</p>`;
  }

  function featureAllowed(featureId) {
    if (!window.FeatureGate?.check) return false;
    return Boolean(window.FeatureGate.check(featureId).ok);
  }

  function percentOf(value, total) {
    const number = Number(value || 0);
    const denominator = Number(total || 0);
    if (!denominator || denominator <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((number / denominator) * 100)));
  }

  function renderShareRows(items, total, labelKey, valueKey) {
    return items
      .map((item) => {
        const value = Number(item[valueKey] || 0);
        const share = percentOf(value, total);
        return (
          `<div class="epos-dashboard-share-row">` +
          `<div class="epos-dashboard-share-meta"><span>${esc(item[labelKey] || '-')}</span><strong>${$money(value)}</strong></div>` +
          `<div class="epos-dashboard-share-track" aria-hidden="true"><i style="width:${share}%"></i></div>` +
          `<small>${share}%</small>` +
          `</div>`
        );
      })
      .join('');
  }

  function dayLabel(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toLocaleDateString(undefined, { weekday: 'short' });
    }
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, { weekday: 'short' });
      }
      return raw.slice(0, 3) || '-';
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function renderUI(state) {
    const result = state || {};
    const stats = result.stats || {};
    const recentSales = result.recentSales || [];
    const lowStock = result.lowStock || [];
    const topProducts = result.topProducts || [];
    const paymentMethods = result.paymentMethods || [];
    const categorySales = result.categorySales || [];
    const salesTrend = result.salesTrend || [];

    $setText('dashboardTodaySales', $money(stats.todaySales));
    $setText('dashboardProfitTotal', $money(stats.totalProfit));
    $setText('dashboardOrderCount', Number(stats.todayOrders || 0).toLocaleString());
    $setText('dashboardLowStockCount', Number(stats.lowStockCount || 0).toLocaleString());
    $setText('dashboardStockValue', $money(stats.stockValue));
    $setText('dashboardReceivableTotal', $money(stats.customerDueTotal));
    $setText('dashboardOutOfStockCount', Number(stats.outOfStockCount || 0).toLocaleString());
    $setText('dashboardReportDate', new Date().toLocaleDateString());

    $setText(
      'dashboardGreeting',
      `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, ${currentProfile?.fullName || currentProfile?.username || 'Admin'}`
    );
    $setText('dashboardUserName', currentProfile?.fullName || currentProfile?.username || '-');
    $setText('dashboardUserRole', currentProfile?.role || '-');

    const salesEl = document.getElementById('dashboardRecentSales');
    if (salesEl) {
      salesEl.innerHTML =
        recentSales
          .map((s) => {
            const invoice = s.invoiceNumber || '-';
            return (
              `<div><span title="${esc(invoice)}">${esc(invoice)}</span><span>${esc(s.customerName || 'Walk-in')}</span>` +
              `<strong>${$money(s.grandTotal)}</strong><span>${esc(s.paymentMethod || 'Cash')}</span></div>`
            );
          })
          .join('') || renderEmptyPanel('No recent transactions yet.');
    }

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

    const chart = document.getElementById('dashboardSalesChart');
    if (chart && featureAllowed('dashboard.sales_chart')) {
      const vals = salesTrend.map((s) => Number(s.total || 0));
      const max = Math.max(...vals, 1);
      const hasSales = vals.some((value) => value > 0);
      chart.innerHTML =
        vals.length && hasSales
          ? vals
              .map((v, index) => {
                const trendDate =
                  salesTrend[index]?.date ||
                  salesTrend[index]?.saleDate ||
                  salesTrend[index]?.sale_date;
                const label = dayLabel(trendDate);
                return (
                  `<span class="epos-dashboard-line-point" title="${esc(label)} - ${$money(v)}">` +
                  `<i class="epos-dashboard-line-bar" style="height:${Math.max(8, Math.round((v / max) * 100))}%"></i>` +
                  `<em>${esc(label)}</em>` +
                  `</span>`
                );
              })
              .join('')
          : renderEmptyPanel('No sales in the selected week yet.');
    }

    const topEl = document.getElementById('dashboardTopProducts');
    if (topEl && featureAllowed('dashboard.top_products')) {
      topEl.innerHTML = topProducts.length
        ? topProducts
            .map((p, i) => {
              const quantity = Number(p.quantity || 0).toLocaleString();
              return (
                `<div><b>${i + 1}</b><span title="${esc(p.name || '-')}">` +
                `<em>${esc(p.name || '-')}</em><small>${quantity} sold</small></span>` +
                `<strong>${$money(p.total)}</strong></div>`
              );
            })
            .join('')
        : renderEmptyPanel('No products sold today.');
    }

    const payEl = document.getElementById('dashboardPaymentMethods');
    const payTotalEl = document.getElementById('dashboardPaymentTotal');
    if (payEl && featureAllowed('dashboard.payment_methods_chart')) {
      const payTotal = paymentMethods.reduce((s, m) => s + Number(m.total || 0), 0);
      if (payTotalEl) payTotalEl.textContent = $money(payTotal);
      payEl.innerHTML =
        paymentMethods.length && payTotal > 0
          ? renderShareRows(paymentMethods, payTotal, 'method', 'total')
          : renderEmptyPanel('No payments recorded today.');
    }

    const catEl = document.getElementById('dashboardCategorySales');
    const catTotalEl = document.getElementById('dashboardCategoryTotal');
    if (catEl && featureAllowed('dashboard.category_sales_chart')) {
      const catTotal = categorySales.reduce((s, c) => s + Number(c.total || 0), 0);
      if (catTotalEl) catTotalEl.textContent = $money(catTotal);
      catEl.innerHTML =
        categorySales.length && catTotal > 0
          ? renderShareRows(categorySales, catTotal, 'category', 'total')
          : renderEmptyPanel('No category sales today.');
    }
  }

  function updateUI(diff) {
    renderUI(diff || {});
  }

  function wireEvents() {
    document.querySelectorAll('#dashboardRoute [data-route]').forEach((btn) => {
      if (!btn._dashboardRouteWired) {
        btn._dashboardRouteWired = true;
        btn.addEventListener('click', () => navigate?.(btn.dataset.route)?.catch?.(() => {}));
      }
    });
    const refreshButton = document.getElementById('dashboardRefreshButton');
    if (refreshButton && !refreshButton._dashboardRefreshWired) {
      refreshButton._dashboardRefreshWired = true;
      refreshButton.addEventListener('click', () => load().catch(() => {}));
    }
  }

  async function load() {
    if (!window.posApi?.dashboard?.overview) return null;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const result = await window.posApi.dashboard.overview();
        if (result?.ok) {
          renderUI(result);
          wireEvents();
        }
        return result;
      } catch {
        return null;
      }
    })().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  function start(options) {
    currentProfile = options?.profile || currentProfile;
    navigate = options?.navigateTo || navigate;
    if (!refreshTimer) {
      refreshTimer = window.setInterval(() => {
        const panel = document.getElementById('dashboardRoute');
        if (panel && !panel.classList.contains('hidden')) {
          load().catch(() => {});
        }
      }, 60000);
    }
    load().catch(() => {});
  }

  function destroyUI() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  window.DashboardRenderer = {
    start,
    load,
    renderUI,
    updateUI,
    destroyUI,
  };
})();

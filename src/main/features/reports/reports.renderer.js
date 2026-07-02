(function ReportsRendererModule() {
  'use strict';

  let currentState = null;

  const api = () => window.ReportsApi;

  function $id(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(value) {
    return `Rs. ${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function dateOnly(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString();
  }

  function setText(id, value) {
    const el = $id(id);
    if (el) el.textContent = value;
  }

  function showMessage(text, type = 'info') {
    const el = $id('reportsMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
    el.style.cssText =
      type === 'error'
        ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5'
        : 'display:block;background:#ecfdf5;color:#047857;border:1px solid #86efac';
  }

  function filters() {
    return {
      from: $id('reportDateFrom')?.value || '',
      to: $id('reportDateTo')?.value || '',
    };
  }

  function valueByKey(item, key) {
    const value = item?.[key];
    if (key.toLowerCase().includes('date') || key.endsWith('At')) return dateOnly(value);
    if (
      typeof value === 'number' &&
      /total|amount|balance|paid|due|refund|cash|profit|sales|purchases|expenses|valuation/i.test(
        key
      )
    ) {
      return money(value);
    }
    return value ?? '-';
  }

  function renderList(id, rows, fields, emptyMessage) {
    const el = $id(id);
    if (!el) return;
    const data = Array.isArray(rows) ? rows : [];
    if (!data.length) {
      el.innerHTML = `<p class="text-zinc-500">${esc(emptyMessage || 'Data unavailable.')}</p>`;
      return;
    }
    el.innerHTML = data
      .slice(0, 80)
      .map(
        (item) => `
          <div class="border-b border-zinc-100 py-2 last:border-b-0">
            ${fields
              .map(
                ([label, key]) =>
                  `<div class="flex justify-between gap-3"><span class="text-zinc-500">${esc(
                    label
                  )}</span><strong class="text-right">${esc(valueByKey(item, key))}</strong></div>`
              )
              .join('')}
          </div>
        `
      )
      .join('');
  }

  function clearLists() {
    [
      'salesReportList',
      'purchaseReportList',
      'purchaseOrderReportList',
      'goodsReceiptReportList',
      'lowStockReportList',
      'cashierReportList',
      'customerDueReportList',
      'creditSalesReportList',
      'returnsReportList',
      'refundSummaryList',
      'supplierBalanceReportList',
      'supplierPaymentReportList',
      'expenseReportList',
      'expenseCategoryReportList',
    ].forEach((id) => {
      const el = $id(id);
      if (el) el.innerHTML = '<p class="text-zinc-500">Data unavailable.</p>';
    });
  }

  function renderUI(state = {}) {
    currentState = state;
    const summary = state.summary || {};
    const cashFlow = summary.cashFlow || state.cashFlow || {};
    setText('reportTotalSales', money(summary.totalSales));
    setText('reportTotalProfit', money(summary.totalProfit));
    setText('reportTotalPurchases', money(summary.totalPurchases));
    setText('reportLowStockCount', Number(summary.lowStockCount || 0).toLocaleString());
    setText('reportTotalExpenses', money(summary.totalExpenses));
    setText('reportNetCash', money(cashFlow.netCash));

    renderList(
      'salesReportList',
      state.sales,
      [
        ['Invoice', 'invoiceNumber'],
        ['Customer', 'customerName'],
        ['Payment', 'paymentMethod'],
        ['Total', 'grandTotal'],
      ],
      'No sales data for this range.'
    );
    renderList(
      'purchaseReportList',
      state.purchases,
      [
        ['Invoice', 'invoiceNumber'],
        ['Supplier', 'supplierName'],
        ['Date', 'purchaseDate'],
        ['Total', 'grandTotal'],
      ],
      'No purchase data for this range.'
    );
    renderList(
      'purchaseOrderReportList',
      state.purchaseOrders,
      [
        ['PO', 'poNumber'],
        ['Supplier', 'supplierName'],
        ['Status', 'status'],
        ['Total', 'total'],
      ],
      'No purchase order data for this range.'
    );
    renderList(
      'goodsReceiptReportList',
      state.goodsReceipts,
      [
        ['Receipt', 'receiptNumber'],
        ['PO', 'poNumber'],
        ['Supplier', 'supplierName'],
        ['Total', 'total'],
      ],
      'No goods receiving data for this range.'
    );
    renderList(
      'lowStockReportList',
      state.lowStock,
      [
        ['Product', 'name'],
        ['SKU', 'sku'],
        ['Stock', 'currentStock'],
        ['Status', 'status'],
      ],
      'No low stock data.'
    );
    renderList(
      'cashierReportList',
      state.cashiers,
      [
        ['Cashier', 'cashierName'],
        ['Sales', 'salesCount'],
        ['Total', 'totalSales'],
      ],
      'No cashier data for this range.'
    );
    renderList(
      'customerDueReportList',
      state.customerDue,
      [
        ['Customer', 'name'],
        ['Phone', 'phone'],
        ['Balance', 'currentBalance'],
      ],
      'No customer due data.'
    );
    renderList(
      'creditSalesReportList',
      state.creditSales,
      [
        ['Invoice', 'invoiceNumber'],
        ['Customer', 'customerName'],
        ['Due', 'dueAmount'],
      ],
      'No credit sales data for this range.'
    );
    renderList(
      'returnsReportList',
      state.returns,
      [
        ['Return', 'returnNumber'],
        ['Invoice', 'invoiceNumber'],
        ['Refund', 'refundTotal'],
        ['Method', 'refundMethod'],
      ],
      'No returns data for this range.'
    );
    renderList(
      'refundSummaryList',
      state.refundSummary,
      [
        ['Method', 'refundMethod'],
        ['Count', 'count'],
        ['Total', 'total'],
      ],
      'No refund summary data for this range.'
    );
    renderList(
      'supplierBalanceReportList',
      state.supplierBalances,
      [
        ['Supplier', 'name'],
        ['Phone', 'phone'],
        ['Balance', 'currentBalance'],
      ],
      'No supplier balance data.'
    );
    renderList(
      'supplierPaymentReportList',
      state.supplierPayments,
      [
        ['Supplier', 'supplierName'],
        ['Method', 'paymentMethod'],
        ['Amount', 'amount'],
      ],
      'No supplier payment data for this range.'
    );
    renderList(
      'expenseReportList',
      state.expenses,
      [
        ['Expense', 'title'],
        ['Category', 'categoryName'],
        ['Amount', 'amount'],
      ],
      'No expense data for this range.'
    );
    renderList(
      'expenseCategoryReportList',
      state.expenseByCategory,
      [
        ['Category', 'categoryName'],
        ['Total', 'total'],
      ],
      'No expense category data for this range.'
    );
  }

  function updateUI(diff = {}) {
    renderUI({ ...(currentState || {}), ...diff });
  }

  function setLoading() {
    showMessage('Loading operational report snapshot...');
    clearLists();
  }

  async function loadReports() {
    const button = $id('loadReportsButton');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    setLoading();
    try {
      const result = await api().overview(filters());
      if (!result?.ok) {
        renderUI({});
        showMessage(result?.message || 'Unable to load reports.', 'error');
        return;
      }
      renderUI(result);
      showMessage('Operational report snapshot loaded.');
    } catch {
      renderUI({});
      showMessage('Unable to load reports.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function destroyUI() {
    currentState = null;
  }

  function attachEvents() {
    const loadButton = $id('loadReportsButton');
    if (loadButton && !loadButton.dataset.reportsBound) {
      loadButton.dataset.reportsBound = 'true';
      loadButton.disabled = false;
      loadButton.setAttribute('aria-disabled', 'false');
      loadButton.textContent = 'Load Snapshot';
      loadButton.title = 'Load read-only operational report snapshot.';
      loadButton.addEventListener('click', loadReports);
    }
    ['exportPdfButton', 'exportExcelButton'].forEach((id) => {
      const button = $id(id);
      if (button) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      }
    });
  }

  function initReportsModule() {
    attachEvents();
    if (!currentState) renderUI({});
  }

  window.initReportsModule = initReportsModule;
  window.ReportsRenderer = {
    renderUI,
    updateUI,
    destroyUI,
    loadReports,
  };
})();

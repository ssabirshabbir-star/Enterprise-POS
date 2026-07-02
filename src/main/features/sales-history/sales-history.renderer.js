(function SalesHistoryRendererModule() {
  'use strict';

  let initialized = false;
  let searchTimer = null;
  let messageTimer = null;
  let currentReceipt = null;
  const listeners = [];

  const A = () => window.SalesHistoryApi;

  function $id(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value || '')
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

  function dateTime(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
  }

  function getFilters() {
    return {
      search: $id('salesHistorySearch')?.value?.trim() || '',
      fromDate: $id('salesHistoryFromDate')?.value || '',
      toDate: $id('salesHistoryToDate')?.value || '',
      status: $id('salesHistoryStatus')?.value || '',
      paymentMethod: $id('salesHistoryPaymentMethod')?.value || '',
    };
  }

  function showMessage(text, type) {
    const el = $id('salesHistoryMessage');
    if (!el) return;
    clearTimeout(messageTimer);
    el.textContent = text || '';
    el.classList.remove('hidden');
    const isError = type === 'error';
    el.style.background = isError ? '#fef2f2' : '#f0fdf4';
    el.style.color = isError ? '#b91c1c' : '#166534';
    el.style.border = isError ? '1px solid #fca5a5' : '1px solid #86efac';
    messageTimer = setTimeout(
      () => {
        el.textContent = '';
        el.classList.add('hidden');
      },
      isError ? 6000 : 3500
    );
  }

  function renderList(invoices) {
    const tbody = $id('salesHistoryList');
    const summary = $id('salesHistoryResultSummary');
    if (!tbody) return;
    const rows = Array.isArray(invoices) ? invoices : [];
    if (summary)
      summary.textContent = `Showing ${rows.length} completed invoice${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="padding:28px;text-align:center;color:#71717a">No completed invoices found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((sale) => {
        const statusColor = sale.status === 'COMPLETED' ? '#166534' : '#92400e';
        const statusBg = sale.status === 'COMPLETED' ? '#dcfce7' : '#fef3c7';
        return `<tr data-sale-id="${sale.id}" style="border-bottom:1px solid #edf2f7">
          <td style="padding:9px;font-weight:800;color:#1d4ed8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sale.invoiceNumber)}</td>
          <td style="padding:9px;color:#52525b">${esc(dateTime(sale.createdAt))}</td>
          <td style="padding:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sale.customerName)}</td>
          <td style="padding:9px">${esc(sale.paymentMethod || '-')}</td>
          <td style="padding:9px;text-align:right;font-weight:800">${money(sale.grandTotal)}</td>
          <td style="padding:9px;text-align:center">
            <span style="display:inline-block;background:${statusBg};color:${statusColor};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800">${esc(sale.status)}</span>
          </td>
          <td style="padding:9px;text-align:center;white-space:nowrap">
            <button type="button" data-view-sale="${sale.id}" class="epos-btn epos-btn-sm epos-btn-primary">View</button>
            <button type="button" data-print-sale="${sale.id}" class="epos-btn epos-btn-sm epos-btn-outline">Print</button>
          </td>
        </tr>`;
      })
      .join('');
  }

  async function loadInvoices() {
    const tbody = $id('salesHistoryList');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="padding:28px;text-align:center;color:#71717a">Loading invoices...</td></tr>';
    }
    try {
      const res = await A().list(getFilters());
      if (!res?.ok) {
        renderList([]);
        showMessage(res?.message || 'Could not load completed invoices.', 'error');
        return;
      }
      renderList(res.invoices || []);
    } catch {
      renderList([]);
      showMessage('Could not load completed invoices.', 'error');
    }
  }

  function totalsMarkup(receipt) {
    return `<div style="display:grid;gap:8px;min-width:260px">
      <div style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${money(receipt.subtotal)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Discount</span><strong>${money(receipt.discount)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Tax</span><strong>${money(receipt.tax)}</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:18px;border-top:1px solid #e5e7eb;padding-top:8px"><span>Total</span><strong>${money(receipt.grandTotal)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Paid</span><strong>${money(receipt.paidAmount)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Change</span><strong>${money(receipt.changeAmount)}</strong></div>
    </div>`;
  }

  function renderDetails(receipt) {
    currentReceipt = receipt;
    const panel = $id('salesHistoryDetailsPanel');
    const title = $id('salesHistoryDetailsTitle');
    const meta = $id('salesHistoryDetailsMeta');
    const body = $id('salesHistoryDetailsBody');
    if (!panel || !body) return;

    if (title) title.textContent = `Invoice ${receipt.invoiceNumber}`;
    if (meta) {
      meta.textContent = `${dateTime(receipt.createdAt)} | ${receipt.customerName || 'Walk-in Customer'} | ${receipt.paymentMethod || '-'}`;
    }

    const itemRows = (receipt.items || [])
      .map(
        (item) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #f1f5f9">${esc(item.productName)}</td>
        <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#71717a">${esc(item.sku || '-')}</td>
        <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${Number(item.quantity || 0)}</td>
        <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${money(item.unitPrice)}</td>
        <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${money(item.discount)}</td>
        <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:800">${money(item.total)}</td>
      </tr>`
      )
      .join('');

    const coupons = receipt.luckyDrawCoupons || [];
    const couponMarkup = coupons.length
      ? coupons
          .map(
            (coupon) =>
              `<span style="display:inline-block;margin:0 6px 6px 0;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:800">${esc(coupon.couponNo)}</span>`
          )
          .join('')
      : '<span style="color:#71717a;font-size:13px">No Lucky Draw coupons for this invoice.</span>';

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:14px">
        <div style="display:grid;gap:5px;font-size:13px;color:#3f3f46">
          <span><strong>Customer:</strong> ${esc(receipt.customerName || 'Walk-in Customer')}</span>
          <span><strong>Cashier:</strong> ${esc(receipt.cashierName || '-')}</span>
          <span><strong>Status:</strong> ${esc(receipt.status || '-')}</span>
          <span><strong>Payment:</strong> ${esc(receipt.paymentMethod || '-')}</span>
        </div>
        ${totalsMarkup(receipt)}
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#f8fafc;color:#52525b">
            <tr>
              <th style="padding:8px;text-align:left">Product</th>
              <th style="padding:8px;text-align:left">SKU</th>
              <th style="padding:8px;text-align:right">Qty</th>
              <th style="padding:8px;text-align:right">Price</th>
              <th style="padding:8px;text-align:right">Discount</th>
              <th style="padding:8px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows || '<tr><td colspan="6" style="padding:18px;text-align:center;color:#71717a">No line items found.</td></tr>'}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:8px;padding:12px">
        <strong style="display:block;margin-bottom:8px;font-size:13px">Lucky Draw Coupons</strong>
        ${couponMarkup}
      </div>`;
    panel.classList.remove('hidden');
    panel.style.display = 'flex';
  }

  function closeDetails() {
    const panel = $id('salesHistoryDetailsPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.style.display = 'none';
    currentReceipt = null;
  }

  async function openDetails(saleId) {
    try {
      const res = await A().getDetails(saleId);
      if (!res?.ok) {
        showMessage(res?.message || 'Could not load invoice details.', 'error');
        return null;
      }
      renderDetails(res.receipt);
      return res.receipt;
    } catch {
      showMessage('Could not load invoice details.', 'error');
      return null;
    }
  }

  async function reprintReceipt(receipt) {
    if (!receipt) return;
    try {
      const res = await A().reprint(receipt);
      showMessage(
        res?.message || (res?.ok ? 'Receipt sent to printer.' : 'Print failed.'),
        res?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Print request failed.', 'error');
    }
  }

  async function printById(saleId) {
    const receipt = await openDetails(saleId);
    if (receipt) await reprintReceipt(receipt);
  }

  function resetFilters() {
    [
      'salesHistorySearch',
      'salesHistoryFromDate',
      'salesHistoryToDate',
      'salesHistoryStatus',
      'salesHistoryPaymentMethod',
    ].forEach((id) => {
      const el = $id(id);
      if (el) el.value = '';
    });
    loadInvoices().catch(() => {});
  }

  function addListener(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    listeners.push({ target, eventName, handler });
  }

  function handleReloadClick() {
    loadInvoices().catch(() => {});
  }

  function handleCloseDetailsClick() {
    closeDetails();
  }

  function handleReprintDetailsClick() {
    reprintReceipt(currentReceipt);
  }

  function handleFilterChange() {
    loadInvoices().catch(() => {});
  }

  function handleSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadInvoices().catch(() => {}), 300);
  }

  function handleListClick(event) {
    const viewButton = event.target.closest('[data-view-sale]');
    const printButton = event.target.closest('[data-print-sale]');
    if (viewButton) openDetails(viewButton.dataset.viewSale).catch(() => {});
    if (printButton) printById(printButton.dataset.printSale).catch(() => {});
  }

  function handleEscapeKey(event) {
    if (event.key === 'Escape') closeDetails();
  }

  function bindEvents() {
    addListener($id('salesHistoryReloadButton'), 'click', handleReloadClick);
    addListener($id('salesHistoryResetButton'), 'click', resetFilters);
    addListener($id('salesHistoryDetailsCloseButton'), 'click', handleCloseDetailsClick);
    addListener($id('salesHistoryDetailsPrintButton'), 'click', handleReprintDetailsClick);

    [
      'salesHistoryFromDate',
      'salesHistoryToDate',
      'salesHistoryStatus',
      'salesHistoryPaymentMethod',
    ].forEach((id) => {
      addListener($id(id), 'change', handleFilterChange);
    });

    addListener($id('salesHistorySearch'), 'input', handleSearchInput);
    addListener($id('salesHistoryList'), 'click', handleListClick);
    addListener(document, 'keydown', handleEscapeKey);
  }

  function renderUI(state = {}) {
    if (!document.getElementById('salesHistoryList')) return;
    if (!initialized) {
      initialized = true;
      bindEvents();
    }
    if (Array.isArray(state.invoices)) {
      renderList(state.invoices);
      return;
    }
    loadInvoices().catch(() => {});
  }

  function updateUI(diff = {}) {
    if (Array.isArray(diff.invoices)) renderList(diff.invoices);
    if (diff.receipt) renderDetails(diff.receipt);
    if (diff.message) showMessage(diff.message, diff.type || 'success');
  }

  function destroyUI() {
    listeners.splice(0).forEach(({ target, eventName, handler }) => {
      target.removeEventListener(eventName, handler);
    });
    clearTimeout(searchTimer);
    clearTimeout(messageTimer);
    searchTimer = null;
    messageTimer = null;
    initialized = false;
    closeDetails();
  }

  function initSalesHistoryModule() {
    renderUI();
  }

  window.SalesHistoryRenderer = {
    destroyUI,
    loadInvoices,
    openDetails,
    renderUI,
    updateUI,
  };
  window.initSalesHistoryModule = initSalesHistoryModule;
})();

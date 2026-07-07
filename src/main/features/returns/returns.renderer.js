(function ReturnsRendererModule() {
  'use strict';

  let initialized = false;
  let currentInvoice = null;
  let messageTimer = null;
  let invoiceLookupSeq = 0;
  let returnsRefreshSeq = 0;

  const A = () => window.ReturnsApi;

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
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
  }

  function numberValue(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function showMessage(text, type) {
    const el = $id('returnsMessage');
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

  function renderInvoiceEmpty(text) {
    const panel = $id('returnInvoicePanel');
    const body = $id('returnItemsBody');
    if (panel) {
      panel.innerHTML = esc(text || 'Search an invoice to start a return.');
      panel.style.color = '#71717a';
    }
    if (body) {
      body.innerHTML =
        '<tr><td colspan="7" style="padding:28px;text-align:center;color:#71717a">No invoice loaded.</td></tr>';
    }
    updateRefundTotal();
  }

  function renderInvoiceSummary(invoice) {
    const panel = $id('returnInvoicePanel');
    const sale = invoice.sale || {};
    const payments = invoice.payments || [];
    const coupons = invoice.coupons || [];
    const paymentText = payments.length
      ? payments.map((p) => `${p.paymentMethod} ${money(p.amount)}`).join(', ')
      : sale.paymentMethod || '-';
    const couponText = coupons.length
      ? coupons
          .map((c) => {
            const state = c.isWinner
              ? 'Winner'
              : c.isUsed
                ? 'Used'
                : c.verificationStatus || 'UNVERIFIED';
            return `${c.couponNo} (${state})`;
          })
          .join(', ')
      : 'No coupons';

    if (!panel) return;
    panel.style.color = '#27272a';
    panel.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;font-size:12px">
        <div><span style="color:#71717a">Invoice</span><strong style="display:block">${esc(sale.invoiceNumber)}</strong></div>
        <div><span style="color:#71717a">Date</span><strong style="display:block">${esc(dateTime(sale.createdAt))}</strong></div>
        <div><span style="color:#71717a">Customer</span><strong style="display:block">${esc(sale.customerName || 'Walk-in Customer')}</strong></div>
        <div><span style="color:#71717a">Cashier</span><strong style="display:block">${esc(sale.cashierName || '-')}</strong></div>
        <div><span style="color:#71717a">Payment</span><strong style="display:block">${esc(sale.paymentMethod || '-')}</strong></div>
        <div><span style="color:#71717a">Original Total</span><strong style="display:block">${money(sale.grandTotal)}</strong></div>
        <div><span style="color:#71717a">Already Returned</span><strong style="display:block">${money(sale.alreadyReturnedTotal)}</strong></div>
        <div><span style="color:#71717a">Return Status</span><strong style="display:block">${esc(sale.returnStatus || '-')}</strong></div>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#52525b"><strong>Payments:</strong> ${esc(paymentText)}</div>
      <div style="margin-top:4px;font-size:12px;color:#52525b"><strong>Lucky Draw:</strong> ${esc(couponText)}</div>`;
  }

  function renderItems(items) {
    const body = $id('returnItemsBody');
    if (!body) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="7" style="padding:28px;text-align:center;color:#71717a">No returnable line items found.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map((item) => {
        const disabled = Number(item.returnableQuantity || 0) <= 0 ? 'disabled' : '';
        return `<tr data-sale-item-id="${item.saleItemId}" style="border-bottom:1px solid #edf2f7">
          <td style="padding:9px;overflow:hidden;text-overflow:ellipsis">
            <strong>${esc(item.productName)}</strong>
            <span style="display:block;color:#71717a;font-size:12px">${esc(item.sku || item.barcode || '-')}</span>
          </td>
          <td style="padding:9px;text-align:right">${Number(item.quantity || 0)}</td>
          <td style="padding:9px;text-align:right">${Number(item.returnedQuantity || 0)}</td>
          <td style="padding:9px;text-align:right;font-weight:800">${Number(item.returnableQuantity || 0)}</td>
          <td style="padding:9px;text-align:right">${money(item.unitRefund)}</td>
          <td style="padding:9px;text-align:center">
            <input data-return-qty="${item.saleItemId}" type="number" min="0" max="${Number(item.returnableQuantity || 0)}" step="0.001" value="0" ${disabled}
              style="width:74px;height:32px;border:1px solid #d4d4d8;border-radius:6px;padding:0 6px;text-align:right" />
          </td>
          <td data-line-refund="${item.saleItemId}" style="padding:9px;text-align:right;font-weight:800">${money(0)}</td>
        </tr>`;
      })
      .join('');
  }

  function itemBySaleItemId(saleItemId) {
    const id = Number(saleItemId);
    return (currentInvoice?.items || []).find((item) => Number(item.saleItemId) === id);
  }

  function updateRefundTotal() {
    let total = 0;
    document.querySelectorAll('[data-return-qty]').forEach((input) => {
      const item = itemBySaleItemId(input.dataset.returnQty);
      if (!item) return;
      const max = Number(item.returnableQuantity || 0);
      let qty = numberValue(input.value);
      if (qty > max) qty = max;
      if (Number(input.value || 0) !== qty) input.value = qty ? String(qty) : '0';
      const line = Number((qty * Number(item.unitRefund || 0)).toFixed(2));
      total += line;
      const lineEl = document.querySelector(`[data-line-refund="${item.saleItemId}"]`);
      if (lineEl) lineEl.textContent = money(line);
    });
    const totalEl = $id('returnTotalRefund');
    if (totalEl) totalEl.textContent = money(total);
    return Number(total.toFixed(2));
  }

  function selectedItems() {
    const items = [];
    document.querySelectorAll('[data-return-qty]').forEach((input) => {
      const qty = numberValue(input.value);
      if (qty > 0) items.push({ saleItemId: Number(input.dataset.returnQty), quantity: qty });
    });
    return items;
  }

  async function lookupInvoice(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const invoiceNumber = String(
      opts.invoiceNumber || $id('returnInvoiceSearch')?.value || ''
    ).trim();
    if (!invoiceNumber) {
      showMessage('Enter an invoice number.', 'error');
      return { ok: false, message: 'Enter an invoice number.' };
    }
    const seq = ++invoiceLookupSeq;
    if (opts.showLoading !== false) renderInvoiceEmpty('Loading invoice...');
    try {
      const res = await A().lookupInvoice({ invoiceNumber });
      if (seq !== invoiceLookupSeq) return res;
      if (!res?.ok) {
        currentInvoice = null;
        renderInvoiceEmpty(res?.message || 'Invoice not found.');
        showMessage(res?.message || 'Invoice not found.', 'error');
        return res;
      }
      currentInvoice = res;
      renderInvoiceSummary(res);
      renderItems(res.items || []);
      updateRefundTotal();
      if (!(res.items || []).some((item) => Number(item.returnableQuantity || 0) > 0)) {
        showMessage('This invoice has no returnable quantity left.', 'error');
      }
      return res;
    } catch {
      if (seq !== invoiceLookupSeq) return { ok: false, stale: true };
      currentInvoice = null;
      renderInvoiceEmpty('Invoice lookup failed.');
      showMessage('Invoice lookup failed.', 'error');
      return { ok: false, message: 'Invoice lookup failed.' };
    }
  }

  async function loadReturns(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const seq = ++returnsRefreshSeq;
    const list = $id('returnsList');
    if (list && opts.showLoading !== false)
      list.innerHTML = '<div style="padding:18px;color:#71717a">Loading returns...</div>';
    try {
      const res = await A().list();
      if (seq !== returnsRefreshSeq) return res;
      const rows = res?.ok && Array.isArray(res.returns) ? res.returns : [];
      const summary = $id('returnsListSummary');
      if (summary) summary.textContent = `${rows.length} recent`;
      if (!list) return res;
      if (!rows.length) {
        list.innerHTML = '<div style="padding:18px;color:#71717a">No returns recorded yet.</div>';
        return res;
      }
      list.innerHTML = rows
        .map(
          (row) => `<div style="padding:10px 12px;border-bottom:1px solid #f1f5f9">
            <strong style="display:block;color:#1d4ed8">${esc(row.returnNumber)}</strong>
            <span style="display:block;color:#27272a">${esc(row.invoiceNumber)} - ${money(row.totalRefund)}</span>
            <span style="display:block;color:#71717a;font-size:12px">${esc(row.refundMethod)} | ${esc(row.customerName || 'Walk-in Customer')} | ${esc(dateTime(row.createdAt))}</span>
          </div>`
        )
        .join('');
      if (!res?.ok) showMessage(res?.message || 'Could not load returns.', 'error');
      return res;
    } catch {
      if (seq !== returnsRefreshSeq) return { ok: false, stale: true };
      if (list)
        list.innerHTML = '<div style="padding:18px;color:#b91c1c">Could not load returns.</div>';
      showMessage('Could not load returns.', 'error');
      return { ok: false, message: 'Could not load returns.' };
    }
  }

  async function refreshReturnsLiveState(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const invoiceNumber = String($id('returnInvoiceSearch')?.value || '').trim();
    const invoicePromise =
      opts.refreshInvoice && invoiceNumber
        ? lookupInvoice({ invoiceNumber, showLoading: opts.showInvoiceLoading === true })
        : Promise.resolve(null);
    const returnsPromise =
      opts.refreshReturns === false
        ? Promise.resolve(null)
        : loadReturns({ showLoading: opts.showReturnsLoading === true });
    const [invoice, returns] = await Promise.all([invoicePromise, returnsPromise]);
    return { invoice, returns };
  }

  function fillFullReturn() {
    if (!currentInvoice) {
      showMessage('Lookup an invoice first.', 'error');
      return;
    }
    document.querySelectorAll('[data-return-qty]').forEach((input) => {
      const item = itemBySaleItemId(input.dataset.returnQty);
      input.value = String(Number(item?.returnableQuantity || 0));
    });
    updateRefundTotal();
  }

  async function processReturn() {
    const button = $id('processReturnButton');
    if (button?.disabled || button?.getAttribute('aria-disabled') === 'true') {
      showMessage('Process Return is disabled until Returns certification is complete.', 'error');
      return;
    }
    if (!currentInvoice?.sale) {
      showMessage('Lookup an invoice first.', 'error');
      return;
    }
    const items = selectedItems();
    if (!items.length) {
      showMessage('Enter return quantity for at least one item.', 'error');
      return;
    }
    const reason = String($id('returnReason')?.value || '').trim();
    if (reason.length < 3) {
      showMessage('Return reason is required.', 'error');
      return;
    }
    if (button) button.disabled = true;
    try {
      const res = await A().create({
        saleId: currentInvoice.sale.id,
        invoiceNumber: currentInvoice.sale.invoiceNumber,
        refundMethod: $id('returnRefundMethod')?.value || 'Cash',
        reason,
        notes: String($id('returnNotes')?.value || '').trim(),
        items,
      });
      if (!res?.ok) {
        showMessage(res?.message || 'Return could not be processed.', 'error');
        return;
      }
      showMessage(res.message || 'Return completed successfully.', 'success');
      await refreshReturnsLiveState({ refreshInvoice: true });
    } catch {
      showMessage('Return could not be processed.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function resetReturns() {
    currentInvoice = null;
    ['returnInvoiceSearch', 'returnReason', 'returnNotes'].forEach((id) => {
      const el = $id(id);
      if (el) el.value = '';
    });
    const method = $id('returnRefundMethod');
    if (method) method.value = 'Cash';
    renderInvoiceEmpty('Search an invoice to start a return.');
    refreshReturnsLiveState().catch(() => {});
  }

  function bindEvents() {
    $id('lookupReturnButton')?.addEventListener('click', () => lookupInvoice().catch(() => {}));
    $id('returnsReloadButton')?.addEventListener('click', () =>
      refreshReturnsLiveState({ showReturnsLoading: true }).catch(() => {})
    );
    $id('returnsResetButton')?.addEventListener('click', resetReturns);
    $id('returnFullButton')?.addEventListener('click', fillFullReturn);
    $id('processReturnButton')?.addEventListener('click', () => processReturn().catch(() => {}));
    $id('returnExchangeButton')?.addEventListener('click', () =>
      showMessage('Exchange workflow is coming soon and is not implemented in Returns v1.', 'error')
    );
    $id('returnInvoiceSearch')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') lookupInvoice().catch(() => {});
    });
    $id('returnItemsBody')?.addEventListener('input', (event) => {
      if (event.target.closest('[data-return-qty]')) updateRefundTotal();
    });
  }

  function initReturnsModule() {
    if (!document.getElementById('returnItemsBody')) return;
    if (!initialized) {
      initialized = true;
      bindEvents();
    }
    refreshReturnsLiveState().catch(() => {});
  }

  window.ReturnsRenderer = {
    loadReturns,
    lookupInvoice,
    refreshReturnsLiveState,
  };
  window.initReturnsModule = initReturnsModule;
})();

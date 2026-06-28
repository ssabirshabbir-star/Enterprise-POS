(function PurchaseOrdersRendererModule() {
  'use strict';

  let initialized = false;
  let orders = [];
  let suppliers = [];
  let products = [];
  let draftItems = [];
  let pageData = null;
  let messageTimer = null;
  let lastLoadError = '';

  const A = () => window.PurchaseOrdersApi;

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
    return `PKR ${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function num(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function dateOnly(value) {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toLocaleDateString();
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function showMessage(text, type = 'info') {
    const el = $id('poMessage');
    if (!el) return;
    clearTimeout(messageTimer);
    el.textContent = text || '';
    el.classList.remove('hidden');
    el.style.cssText =
      type === 'error'
        ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5'
        : 'display:block;background:#ecfdf5;color:#047857;border:1px solid #86efac';
    messageTimer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 6000 : 3500);
  }

  function setText(id, value) {
    const el = $id(id);
    if (el) el.textContent = value;
  }

  function productLabel(product) {
    return `${product.name || ''} ${product.sku || ''} ${product.barcode || ''}`.trim();
  }

  function selectedProduct() {
    const selectId = Number($id('poItemProduct')?.value || 0);
    if (selectId) return products.find((p) => Number(p.id) === selectId);
    const text = String($id('poBarcodeInput')?.value || '').toLowerCase();
    return products.find((p) => productLabel(p).toLowerCase().includes(text));
  }

  function renderLookups() {
    const supplierSelect = $id('poSupplier');
    if (supplierSelect) {
      supplierSelect.innerHTML =
        '<option value="">Select Supplier</option>' +
        suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    }

    const warehouseSelect = $id('poWarehouse');
    if (warehouseSelect) {
      const warehouses = pageData?.warehouses || [];
      warehouseSelect.innerHTML =
        '<option value="">Select Warehouse</option>' +
        warehouses
          .map(
            (w) =>
              `<option value="${esc(w.id)}">${esc(w.name)}${w.isDefault ? ' (Default)' : ''}</option>`
          )
          .join('');
    }

    const productSelect = $id('poItemProduct');
    if (productSelect) {
      productSelect.innerHTML =
        '<option value="">Select Product</option>' +
        products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    }

    const dataList = $id('poProductLookupList');
    if (dataList) {
      dataList.innerHTML = products
        .map((p) => `<option value="${esc(productLabel(p))}"></option>`)
        .join('');
    }
  }

  function renderStats() {
    const stats = pageData?.stats || {};
    setText('poStatTotal', Number(stats.totalPOs || 0).toLocaleString());
    setText('poStatPending', Number(stats.pendingPOs || 0).toLocaleString());
    setText('poStatGrn', Number(stats.grnCompleted || 0).toLocaleString());
    setText('poStatSpent', money(stats.totalSpent));
  }

  function getFilters() {
    return {
      search: String($id('poSearch')?.value || '').trim(),
      status: $id('poStatusFilter')?.value || 'ACTIVE',
      fromDate: $id('poFromDate')?.value || '',
      toDate: $id('poToDate')?.value || '',
    };
  }

  function renderOrders() {
    const list = $id('poList');
    if (!list) return;
    if (!orders.length) {
      list.innerHTML = `<div class="epos-po-empty">${esc(lastLoadError || 'No purchase orders found.')}</div>`;
      return;
    }
    list.innerHTML = orders
      .map(
        (o) => `<div class="epos-po-list-row" data-po-id="${esc(o.id)}">
          <strong>${esc(o.poNumber)}</strong>
          <span>${esc(o.supplierName || 'No supplier')}</span>
          <span>${esc(o.status)}</span>
          <span>${esc(dateOnly(o.expectedDate || o.createdAt))}</span>
          <strong>${money(o.total)}</strong>
          <button type="button" data-po-view="${esc(o.id)}">View</button>
        </div>`
      )
      .join('');
  }

  async function loadPageData() {
    const [dataRes, supplierRes, productRes] = await Promise.all([
      A().pageData(),
      A().suppliers(),
      A().products({ limit: 200, tab: 'active' }),
    ]);
    pageData = dataRes?.ok ? dataRes : null;
    suppliers = supplierRes?.ok ? supplierRes.suppliers || [] : [];
    products = productRes?.ok ? productRes.products || [] : [];
    renderStats();
    renderLookups();
    if ($id('poNumber') && !$id('poNumber').value && pageData?.nextNumber) {
      $id('poNumber').value = pageData.nextNumber;
    }
    if ($id('poDate') && !$id('poDate').value) $id('poDate').value = today();
  }

  async function loadOrders() {
    const list = $id('poList');
    if (list) list.innerHTML = '<div class="epos-po-empty">Loading purchase orders...</div>';
    try {
      const res = await A().list(getFilters());
      if (!res?.ok) {
        orders = [];
        lastLoadError = res?.message || 'Could not load purchase orders.';
        renderOrders();
        showMessage(lastLoadError, 'error');
        return;
      }
      lastLoadError = '';
      orders = res.orders || [];
      renderOrders();
    } catch {
      orders = [];
      lastLoadError = 'Could not load purchase orders.';
      renderOrders();
      showMessage(lastLoadError, 'error');
    }
  }

  function draftTotals() {
    const subtotal = draftItems.reduce((sum, item) => sum + num(item.total), 0);
    const discount = num($id('poDiscount')?.value);
    const total = Math.max(Number((subtotal - discount).toFixed(2)), 0);
    return { subtotal, discount, total };
  }

  function renderDraft() {
    const tbody = $id('poItemsList');
    if (tbody) {
      tbody.innerHTML = draftItems.length
        ? draftItems
            .map(
              (item, index) => `<tr>
                <td>${index + 1}</td>
                <td>${esc(item.productName)}</td>
                <td>${esc(item.barcode || '-')}</td>
                <td>${esc(item.unitName || '-')}</td>
                <td>${num(item.orderedQty)}</td>
                <td>${money(item.cost)}</td>
                <td>0</td>
                <td>${money(item.total)}</td>
                <td>${money(item.total)}</td>
                <td><button type="button" data-po-remove-item="${index}">Remove</button></td>
              </tr>`
            )
            .join('')
        : '<tr><td colspan="10" style="padding:16px;text-align:center;color:#64748b">No PO items added yet.</td></tr>';
    }
    const totals = draftTotals();
    setText('poSummaryItems', draftItems.length);
    setText('poSummaryItemsTotal', money(totals.subtotal));
    setText('poSummaryDiscount', money(totals.discount));
    setText('poSummaryShipping', money(0));
    setText('poSummaryTotal', money(totals.total));
    const footer = $id('poTotals');
    if (footer)
      footer.textContent = `Subtotal ${money(totals.subtotal)} | Discount ${money(totals.discount)} | Total ${money(totals.total)}`;
  }

  function fillProductFields() {
    const product = selectedProduct();
    if (!product) return;
    if ($id('poItemProduct')) $id('poItemProduct').value = String(product.id);
    if ($id('poItemCost') && !$id('poItemCost').value)
      $id('poItemCost').value = product.purchasePrice || 0;
    if ($id('poItemSale') && !$id('poItemSale').value)
      $id('poItemSale').value = product.salePrice || 0;
  }

  function addDraftItem() {
    fillProductFields();
    const product = selectedProduct();
    const orderedQty = num($id('poItemQty')?.value);
    const cost = num($id('poItemCost')?.value || product?.purchasePrice);
    const salePrice = num($id('poItemSale')?.value || product?.salePrice);
    if (!product) return showMessage('Select a product first.', 'error');
    if (orderedQty <= 0) return showMessage('Enter a valid quantity.', 'error');
    if (cost < 0 || salePrice < 0) return showMessage('Enter valid prices.', 'error');
    draftItems.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      barcode: product.barcode,
      unitName: product.unitName || product.unitShortName,
      orderedQty,
      cost,
      salePrice,
      total: Number((orderedQty * cost).toFixed(2)),
    });
    ['poBarcodeInput', 'poItemProduct', 'poItemQty', 'poItemCost', 'poItemSale'].forEach((id) => {
      const el = $id(id);
      if (el) el.value = '';
    });
    renderDraft();
  }

  function clearDraft(options = {}) {
    $id('poForm')?.reset();
    draftItems = [];
    if ($id('poDate')) $id('poDate').value = today();
    if ($id('poNumber')) $id('poNumber').value = pageData?.nextNumber || '';
    renderDraft();
    if (!options.silent) showMessage('Purchase order draft cleared.');
  }

  function buildPayload(status) {
    return {
      supplierId: $id('poSupplier')?.value || null,
      poNumber: String($id('poNumber')?.value || '').trim(),
      expectedDate: $id('poExpectedDate')?.value || null,
      discount: draftTotals().discount,
      tax: 0,
      status,
      notes: String($id('poNotes')?.value || $id('poOtherNotes')?.value || '').trim(),
      items: draftItems,
    };
  }

  async function saveOrder(status) {
    if (!draftItems.length) return showMessage('Add at least one PO item.', 'error');
    if (!$id('poNumber')?.value) return showMessage('PO number is required.', 'error');
    const res = await A().create(buildPayload(status));
    showMessage(
      res?.message || (res?.ok ? 'Purchase order saved.' : 'Purchase order could not be saved.'),
      res?.ok ? 'success' : 'error'
    );
    if (res?.ok) {
      clearDraft({ silent: true });
      await loadPageData();
      await loadOrders();
    }
  }

  async function viewOrder(id) {
    const res = await A().details(id);
    if (!res?.ok) return showMessage(res?.message || 'Purchase order details not found.', 'error');
    const order = res.order || {};
    const items = order.items || [];
    const details = $id('poDetailsPanel');
    if (details) {
      details.innerHTML = `<strong>${esc(order.poNumber)}</strong>
        <p>${esc(order.supplierName || 'No supplier')} | ${esc(order.status)} | ${money(order.total)}</p>
        <div>${items.map((i) => `<span>${esc(i.productName)} (${num(i.orderedQty)})</span>`).join(' ') || 'No items.'}</div>
        <small>Approval, receiving, GRN and invoice conversion are Phase 2.</small>`;
    }
  }

  function bindEvents() {
    $id('resetPoButton')?.addEventListener('click', clearDraft);
    $id('poGenerateNumberButton')?.addEventListener('click', () => {
      if ($id('poNumber')) $id('poNumber').value = pageData?.nextNumber || $id('poNumber').value;
    });
    $id('poForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveOrder('PENDING_APPROVAL').catch(() =>
        showMessage('Purchase order could not be saved.', 'error')
      );
    });
    $id('savePoButton')?.addEventListener('click', () =>
      saveOrder('DRAFT').catch(() => showMessage('Purchase order could not be saved.', 'error'))
    );
    $id('poBackButton')?.addEventListener('click', clearDraft);
    $id('addPoItemButton')?.addEventListener('click', addDraftItem);
    $id('poBarcodeButton')?.addEventListener('click', addDraftItem);
    $id('poBarcodeInput')?.addEventListener('change', fillProductFields);
    $id('poItemProduct')?.addEventListener('change', fillProductFields);
    $id('poDiscount')?.addEventListener('input', renderDraft);
    ['poSearch', 'poStatusFilter', 'poFromDate', 'poToDate'].forEach((id) => {
      $id(id)?.addEventListener('input', () => loadOrders().catch(() => {}));
      $id(id)?.addEventListener('change', () => loadOrders().catch(() => {}));
    });
    $id('poItemsList')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-po-remove-item]');
      if (!btn) return;
      draftItems.splice(Number(btn.dataset.poRemoveItem), 1);
      renderDraft();
    });
    $id('poList')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-po-view]');
      if (btn)
        viewOrder(btn.dataset.poView).catch(() =>
          showMessage('Could not load PO details.', 'error')
        );
    });
    document.querySelectorAll('[data-po-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        document.querySelectorAll('[data-po-tab]').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('[data-po-panel]').forEach((p) => p.classList.add('hidden'));
        btn.classList.add('active');
        document
          .querySelector(`[data-po-panel="${btn.dataset.poTab}"]`)
          ?.classList.remove('hidden');
      })
    );
  }

  async function initPurchaseOrdersModule() {
    if (!$id('poList')) return;
    if (!initialized) {
      initialized = true;
      bindEvents();
    }
    await loadPageData();
    renderDraft();
    await loadOrders();
  }

  window.initPurchaseOrdersModule = initPurchaseOrdersModule;
})();

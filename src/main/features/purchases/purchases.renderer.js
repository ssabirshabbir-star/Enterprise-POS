(function PurchasesRendererModule() {
  'use strict';

  let initialized = false;
  let purchases = [];
  let suppliers = [];
  let products = [];
  let draftItems = [];
  let selectedPurchaseId = null;
  let messageTimer = null;
  let lastLoadError = '';
  let purchaseRefreshSeq = 0;
  let purchaseDetailRefreshSeq = 0;

  const A = () => window.PurchasesApi;

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

  function showMessage(text, type = 'info') {
    const el = $id('purchaseMessage');
    if (!el) return;
    clearTimeout(messageTimer);
    const isError = type === 'error';
    el.textContent = text || '';
    el.classList.remove('hidden');
    el.style.cssText = isError
      ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5'
      : 'display:block;background:#ecfdf5;color:#047857;border:1px solid #86efac';
    messageTimer = setTimeout(() => el.classList.add('hidden'), isError ? 6000 : 4000);
  }

  function dateOnly(value) {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toLocaleDateString();
  }

  function isoDate(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  function numeric(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function setTodayIfEmpty(id) {
    const el = $id(id);
    if (el && !el.value) el.value = new Date().toISOString().slice(0, 10);
  }

  function purchasePaymentStatus(p) {
    if (numeric(p.dueAmount) <= 0) return 'PAID';
    return numeric(p.paidAmount) > 0 ? 'PARTIAL' : 'UNPAID';
  }

  function purchasePaymentMethod(p) {
    return String(p.paymentMethod || (numeric(p.dueAmount) > 0 ? 'Credit' : 'Cash'));
  }

  function purchaseStatus(p) {
    const status = String(p.status || '').toUpperCase();
    if (status === 'RECEIVED') return purchasePaymentStatus(p);
    return status || purchasePaymentStatus(p);
  }

  function getFilters() {
    return {
      search: String($id('purchaseKeywordSearch')?.value || '')
        .trim()
        .toLowerCase(),
      supplierId: $id('purchaseSupplierFilter')?.value || '',
      method: $id('purchaseMethodFilter')?.value || '',
      payment: $id('purchasePaymentFilter')?.value || '',
      status:
        document.querySelector('[data-purchase-status-tab].active')?.dataset.purchaseStatusTab ||
        '',
      from: $id('purchaseFilterFrom')?.value || '',
      to: $id('purchaseFilterTo')?.value || '',
    };
  }

  function filteredPurchases() {
    const f = getFilters();
    return purchases.filter((p) => {
      const searchHaystack =
        `${p.invoiceNumber || ''} ${p.supplierName || ''} ${p.productNames || ''} ${p.productSearchText || ''} ${p.grandTotal || ''}`.toLowerCase();
      const paymentStatus = purchasePaymentStatus(p);
      const rowStatus = purchaseStatus(p);
      const rowDate = isoDate(p.purchaseDate);
      if (f.search && !searchHaystack.includes(f.search)) return false;
      if (f.supplierId && String(p.supplierId || '') !== f.supplierId) return false;
      if (f.method && purchasePaymentMethod(p) !== f.method) return false;
      if (f.payment && paymentStatus !== f.payment) return false;
      if (f.status && rowStatus !== f.status) return false;
      if (f.from && (!rowDate || rowDate < f.from)) return false;
      if (f.to && (!rowDate || rowDate > f.to)) return false;
      return true;
    });
  }

  function hasActiveFilters() {
    const f = getFilters();
    return Boolean(f.search || f.supplierId || f.method || f.payment || f.status || f.from || f.to);
  }

  function renderStats(rows) {
    const count = rows.length;
    const spend = rows.reduce((sum, p) => sum + numeric(p.grandTotal), 0);
    const paid = rows.reduce((sum, p) => sum + numeric(p.paidAmount), 0);
    const due = rows.reduce((sum, p) => sum + numeric(p.dueAmount), 0);
    const pending = rows.filter((p) => numeric(p.dueAmount) > 0);
    const set = (id, value) => {
      const el = $id(id);
      if (el) el.textContent = value;
    };
    set('purchaseStatCount', count);
    set('purchaseStatSpend', money(spend));
    set('purchaseStatPending', pending.length);
    set('purchaseStatPendingAmount', money(due));
    set('purchaseStatPaid', rows.filter((p) => numeric(p.dueAmount) <= 0).length);
    set('purchaseStatPaidAmount', money(paid));
    set('purchaseStatOverdue', '-');
    set('purchaseStatOverdueAmount', 'Planned');
    set('purchaseFooterCount', count);
    set('purchaseFooterTotal', money(spend));
    set('purchaseFooterPaid', money(paid));
    set('purchaseFooterDue', money(due));
    set('purchasePageInfo', count ? `1-${count} of ${count}` : '0-0 of 0');
  }

  function renderPurchases() {
    const tbody = $id('purchaseList');
    if (!tbody) return;
    const rows = filteredPurchases();
    renderStats(rows);
    if (!rows.length) {
      const message = lastLoadError
        ? lastLoadError
        : purchases.length
          ? 'No purchases match the selected filters. Use Reset to show all purchases.'
          : 'No purchase records found. Use Add Purchase to create the first purchase.';
      tbody.innerHTML = `<tr><td colspan="11" style="padding:24px;text-align:center;color:#71717a">${esc(message)}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map((p, index) => {
        const paymentStatus = purchasePaymentStatus(p);
        return `<tr data-purchase-id="${p.id}" class="${String(p.id) === String(selectedPurchaseId) ? 'epos-purchase-row-selected' : ''}">
          <td>${index + 1}</td>
          <td>${esc(p.invoiceNumber)}</td>
          <td>${esc(p.supplierName || 'No supplier')}</td>
          <td>${esc(dateOnly(p.purchaseDate))}</td>
          <td>${esc(dateOnly(p.createdAt))}</td>
          <td>${money(p.grandTotal)}</td>
          <td>${money(p.paidAmount)}</td>
          <td>${money(p.dueAmount)}</td>
          <td>${esc(paymentStatus)}</td>
          <td>${esc(purchasePaymentMethod(p))}</td>
          <td><span class="epos-purchase-actions">
            <button type="button" data-purchase-view="${p.id}">View</button>
            <button type="button" disabled title="Purchase printing is planned for a future phase.">Print</button>
            <button type="button" disabled title="Rollback is not enabled in Purchases Phase 1.">Rollback</button>
          </span></td>
        </tr>`;
      })
      .join('');
  }

  function optionRows(rows, label, value = 'id') {
    return rows
      .map((row) => `<option value="${esc(row[value])}">${esc(row[label])}</option>`)
      .join('');
  }

  function setOptionsPreservingValue(el, html) {
    if (!el) return;
    const current = el.value;
    el.innerHTML = html;
    if ([...el.options].some((option) => option.value === current)) el.value = current;
  }

  function renderLookupData() {
    const supplierOptions =
      '<option value="">No Supplier / Cash Purchase</option>' + optionRows(suppliers, 'name');
    ['purchaseSupplier', 'purchaseSupplierFilter'].forEach((id) => {
      const el = $id(id);
      if (el) {
        const options =
          id === 'purchaseSupplierFilter'
            ? '<option value="">All Suppliers</option>' + optionRows(suppliers, 'name')
            : supplierOptions;
        setOptionsPreservingValue(el, options);
      }
    });
    const productOptions =
      '<option value="">Select product</option>' + optionRows(products, 'name');
    const productSelect = $id('purchaseItemProduct');
    if (productSelect) setOptionsPreservingValue(productSelect, productOptions);
    const datalist = $id('purchaseProductLookupList');
    if (datalist) {
      datalist.innerHTML = products
        .map(
          (p) => `<option value="${esc(`${p.name} ${p.sku || ''} ${p.barcode || ''}`)}"></option>`
        )
        .join('');
    }
  }

  async function loadLookups() {
    const [supplierRes, productRes] = await Promise.all([A().suppliers(), A().products()]);
    suppliers = supplierRes?.ok ? supplierRes.suppliers || [] : [];
    products = productRes?.ok ? productRes.products || [] : [];
    renderLookupData();
    if (!supplierRes?.ok)
      showMessage(supplierRes?.message || 'Supplier dropdown could not be loaded.', 'error');
    if (!productRes?.ok)
      showMessage(productRes?.message || 'Product dropdown could not be loaded.', 'error');
    return { suppliers: supplierRes, products: productRes };
  }

  function isDetailModalOpen() {
    const modal = $id('purchaseDetailModal');
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  async function refreshSelectedPurchaseDetail(id, options = {}) {
    const detailId = id || selectedPurchaseId;
    if (!detailId) return null;
    const seq = ++purchaseDetailRefreshSeq;
    try {
      const res = await A().details(detailId);
      if (seq !== purchaseDetailRefreshSeq || String(selectedPurchaseId) !== String(detailId)) {
        return res;
      }
      if (!res?.ok) {
        if (!options.silent) showMessage(res?.message || 'Purchase details not found.', 'error');
        return res;
      }
      renderPurchaseDetails(res.purchase);
      return res;
    } catch {
      if (seq === purchaseDetailRefreshSeq && !options.silent)
        showMessage('Could not load purchase details.', 'error');
      return { ok: false, message: 'Could not load purchase details.' };
    }
  }

  async function reconcileSelectedPurchase(options = {}) {
    if (!selectedPurchaseId) return null;
    const exists = purchases.some((p) => String(p.id) === String(selectedPurchaseId));
    if (!exists) {
      selectedPurchaseId = null;
      renderPurchases();
      if (options.closeMissingSelected !== false) closeDetailModal();
      return { ok: false, missing: true };
    }
    if (options.refreshDetail && isDetailModalOpen()) {
      return refreshSelectedPurchaseDetail(selectedPurchaseId, { silent: true });
    }
    return { ok: true };
  }

  async function loadPurchases(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const seq = ++purchaseRefreshSeq;
    const tbody = $id('purchaseList');
    if (tbody && opts.showLoading !== false)
      tbody.innerHTML =
        '<tr><td colspan="11" style="padding:24px;text-align:center;color:#71717a">Loading purchases...</td></tr>';
    try {
      const res = await A().list();
      if (seq !== purchaseRefreshSeq) return res;
      if (!res?.ok) {
        purchases = [];
        lastLoadError = res?.message || 'Could not load purchases.';
        renderUI({ purchases: [] });
        showMessage(lastLoadError, 'error');
        return res;
      }
      lastLoadError = '';
      purchases = res.purchases || [];
      renderUI({ purchases });
      await reconcileSelectedPurchase({
        refreshDetail: opts.refreshDetail ?? true,
        closeMissingSelected: opts.closeMissingSelected,
      });
      return res;
    } catch {
      if (seq !== purchaseRefreshSeq) return { ok: false, stale: true };
      purchases = [];
      lastLoadError = 'Could not load purchases.';
      renderUI({ purchases: [] });
      showMessage(lastLoadError, 'error');
      return { ok: false, message: lastLoadError };
    }
  }

  async function refreshPurchaseLiveState(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const [purchaseRes, lookupRes] = await Promise.all([
      loadPurchases({
        showLoading: opts.showLoading === true,
        refreshDetail: opts.refreshDetail !== false,
        closeMissingSelected: opts.closeMissingSelected !== false,
      }),
      opts.includeLookups ? loadLookups() : Promise.resolve(null),
    ]);
    return { purchases: purchaseRes, lookups: lookupRes };
  }

  function openForm() {
    const modal = $id('purchaseFormModal');
    if (modal) modal.classList.remove('hidden');
    setTodayIfEmpty('purchaseDate');
    draftItems = [];
    renderDraftItems();
  }

  function closeForm() {
    const modal = $id('purchaseFormModal');
    if (modal) modal.classList.add('hidden');
  }

  function closeDetailModal() {
    const modal = $id('purchaseDetailModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function resetForm() {
    $id('purchaseForm')?.reset();
    $id('supplierForm')?.reset();
    draftItems = [];
    setTodayIfEmpty('purchaseDate');
    renderDraftItems();
  }

  function selectedProduct() {
    const id = Number($id('purchaseItemProduct')?.value || 0);
    return products.find((p) => Number(p.id) === id);
  }

  function syncProductFromLookup() {
    const text = String($id('purchaseItemLookup')?.value || '').toLowerCase();
    if (!text) return;
    const match = products.find((p) =>
      `${p.name || ''} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase().includes(text)
    );
    if (match && $id('purchaseItemProduct')) $id('purchaseItemProduct').value = String(match.id);
    fillSelectedProductPrices();
  }

  function fillSelectedProductPrices() {
    const product = selectedProduct();
    const cost = $id('purchaseItemCost');
    const sale = $id('purchaseItemSale');
    if (product && cost && !cost.value) cost.value = product.purchasePrice || '';
    if (product && sale && !sale.value) sale.value = product.salePrice || '';
  }

  function addDraftItem() {
    syncProductFromLookup();
    const product = selectedProduct();
    const quantity = numeric($id('purchaseItemQty')?.value);
    const purchasePrice = numeric($id('purchaseItemCost')?.value || product?.purchasePrice);
    const salePrice = numeric($id('purchaseItemSale')?.value || product?.salePrice);
    if (!product) return showMessage('Select a product first.', 'error');
    if (quantity <= 0) return showMessage('Enter a valid quantity.', 'error');
    if (purchasePrice < 0 || salePrice < 0) return showMessage('Enter valid prices.', 'error');
    draftItems.push({
      productId: product.id,
      productName: product.name,
      quantity,
      purchasePrice,
      salePrice,
      batchNumber: String($id('purchaseItemBatch')?.value || '').trim(),
      expirationDate: $id('purchaseItemExpiry')?.value || null,
      total: Number((quantity * purchasePrice).toFixed(2)),
    });
    [
      'purchaseItemLookup',
      'purchaseItemQty',
      'purchaseItemCost',
      'purchaseItemSale',
      'purchaseItemBatch',
    ].forEach((id) => {
      const el = $id(id);
      if (el) el.value = '';
    });
    renderDraftItems();
  }

  function draftTotals() {
    const subtotal = draftItems.reduce((sum, item) => sum + numeric(item.total), 0);
    const discount = numeric($id('purchaseDiscount')?.value);
    const tax = numeric($id('purchaseTax')?.value);
    const paid = numeric($id('purchasePaid')?.value);
    const grand = Math.max(Number((subtotal - discount + tax).toFixed(2)), 0);
    return {
      subtotal,
      discount,
      tax,
      paid,
      grand,
      due: Math.max(Number((grand - paid).toFixed(2)), 0),
    };
  }

  function renderDraftItems() {
    const list = $id('purchaseItemsList');
    if (list) {
      list.innerHTML = draftItems.length
        ? draftItems
            .map(
              (
                item,
                index
              ) => `<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:8px;border-bottom:1px solid #e5e7eb">
                <span><strong>${esc(item.productName)}</strong><small style="display:block;color:#71717a">${item.quantity} x ${money(item.purchasePrice)}</small></span>
                <strong>${money(item.total)}</strong>
                <button type="button" data-remove-purchase-item="${index}" class="epos-btn epos-btn-sm epos-btn-outline">Remove</button>
              </div>`
            )
            .join('')
        : '<p style="color:#71717a">No items added yet.</p>';
    }
    const totals = draftTotals();
    const totalEl = $id('purchaseTotals');
    if (totalEl) {
      totalEl.innerHTML = `<strong>Subtotal: ${money(totals.subtotal)}</strong><span>Discount: ${money(totals.discount)}</span><span>Tax: ${money(totals.tax)}</span><strong>Total: ${money(totals.grand)}</strong><span>Due: ${money(totals.due)}</span>`;
    }
  }

  async function savePurchase(event) {
    event.preventDefault();
    if (!draftItems.length) return showMessage('Add at least one purchase item.', 'error');
    const totals = draftTotals();
    if (totals.paid > totals.grand) return showMessage('Paid amount cannot exceed total.', 'error');
    const invoiceNumber = String($id('purchaseInvoice')?.value || '').trim();
    if (!invoiceNumber) return showMessage('Invoice number is required.', 'error');
    const button = $id('savePurchaseButton');
    if (button) button.disabled = true;
    try {
      const res = await A().create({
        supplierId: $id('purchaseSupplier')?.value || null,
        invoiceNumber,
        purchaseDate: $id('purchaseDate')?.value || new Date().toISOString().slice(0, 10),
        discount: totals.discount,
        tax: totals.tax,
        paidAmount: totals.paid,
        items: draftItems,
      });
      showMessage(
        res?.message || (res?.ok ? 'Purchase saved.' : 'Purchase could not be saved.'),
        res?.ok ? 'success' : 'error'
      );
      if (res?.ok) {
        resetForm();
        closeForm();
        await refreshPurchaseLiveState({ showLoading: false, includeLookups: true });
      }
    } catch {
      showMessage('Purchase could not be saved.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function saveQuickSupplier(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(form.elements.name?.value || '').trim();
    if (name.length < 2) return showMessage('Supplier name is required.', 'error');
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const res = await A().createSupplier({
        name,
        phone: String(form.elements.phone?.value || '').trim(),
        email: String(form.elements.email?.value || '').trim(),
      });
      showMessage(
        res?.message || (res?.ok ? 'Supplier saved.' : 'Supplier could not be saved.'),
        res?.ok ? 'success' : 'error'
      );
      if (res?.ok) {
        form.reset();
        await loadLookups();
        if ($id('purchaseSupplier') && res.supplier?.id)
          $id('purchaseSupplier').value = String(res.supplier.id);
      }
    } catch {
      showMessage('Supplier could not be saved.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function viewPurchase(id) {
    const previousPurchaseId = selectedPurchaseId;
    selectedPurchaseId = id;
    renderPurchases();
    const res = await refreshSelectedPurchaseDetail(id);
    if (!res?.ok && String(selectedPurchaseId) === String(id)) {
      selectedPurchaseId = previousPurchaseId;
      renderPurchases();
    }
  }

  function detailField(label, value) {
    return `<article style="border:1px solid #e3eaf6;border-radius:10px;background:#f8fbff;padding:10px;min-width:0">
      <span style="display:block;color:#64748b;font-size:10px;font-weight:850;text-transform:uppercase">${esc(label)}</span>
      <strong style="display:block;margin-top:4px;color:#11184d;font-size:13px;font-weight:950;overflow-wrap:anywhere">${esc(value || '-')}</strong>
    </article>`;
  }

  function renderPurchaseDetails(purchase = {}) {
    const modal = $id('purchaseDetailModal');
    const title = $id('purchaseDetailTitle');
    const content = $id('purchaseDetailContent');
    if (!modal || !content) return;
    if (title) title.textContent = purchase.invoiceNumber || 'Purchase Details';

    const items = Array.isArray(purchase.items) ? purchase.items : [];
    const rows = items.length
      ? items
          .map(
            (item, index) => `<tr>
              <td>${index + 1}</td>
              <td>${esc(item.productName || '-')}</td>
              <td>${esc(item.sku || '-')}</td>
              <td>${esc(item.batchNumber || '-')}</td>
              <td>${esc(dateOnly(item.expirationDate))}</td>
              <td>${esc(item.quantity)}</td>
              <td>${money(item.purchasePrice)}</td>
              <td>${money(item.salePrice)}</td>
              <td>${money(item.total)}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="9" style="padding:18px;text-align:center;color:#71717a">No line items available.</td></tr>';

    content.innerHTML = `
      <section style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
        ${detailField('Invoice Number', purchase.invoiceNumber)}
        ${detailField('Supplier', purchase.supplierName || 'No supplier')}
        ${detailField('Purchase Date', dateOnly(purchase.purchaseDate))}
        ${detailField('Status', purchaseStatus(purchase))}
        ${detailField('Subtotal', money(purchase.subtotal))}
        ${detailField('Discount', money(purchase.discount))}
        ${detailField('Tax', money(purchase.tax))}
        ${detailField('Grand Total', money(purchase.grandTotal))}
        ${detailField('Paid Amount', money(purchase.paidAmount))}
        ${detailField('Due Amount', money(purchase.dueAmount))}
        ${detailField('Payment Method', purchasePaymentMethod(purchase))}
        ${detailField('Created', dateOnly(purchase.createdAt))}
      </section>
      <section style="border:1px solid #e3eaf6;border-radius:10px;background:#f8fbff;padding:10px">
        <span style="display:block;color:#64748b;font-size:10px;font-weight:850;text-transform:uppercase">Reference Data</span>
        <strong style="display:block;margin-top:4px;color:#11184d;font-size:13px;font-weight:950">Purchase ID: ${esc(purchase.id || '-')} | Supplier ID: ${esc(purchase.supplierId || '-')}</strong>
      </section>
      <section style="min-height:0;max-height:260px;overflow:auto;border:1px solid #e3eaf6;border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#eef6ff;color:#17213e">
              <th style="padding:8px;text-align:left">#</th>
              <th style="padding:8px;text-align:left">Product</th>
              <th style="padding:8px;text-align:left">SKU</th>
              <th style="padding:8px;text-align:left">Batch</th>
              <th style="padding:8px;text-align:left">Expiry</th>
              <th style="padding:8px;text-align:left">Qty</th>
              <th style="padding:8px;text-align:left">Cost</th>
              <th style="padding:8px;text-align:left">Sale</th>
              <th style="padding:8px;text-align:left">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <p style="margin:0;color:#64748b;font-size:12px;font-weight:800">Read-only detail view. Edit, delete, rollback, payment settlement, printing, import/export, WhatsApp, and pagination remain separate workflows.</p>
    `;

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function clearFilters() {
    ['purchaseKeywordSearch', 'purchaseFilterFrom', 'purchaseFilterTo'].forEach((id) => {
      const el = $id(id);
      if (el) el.value = '';
    });
    ['purchaseSupplierFilter', 'purchaseMethodFilter', 'purchasePaymentFilter'].forEach((id) => {
      const el = $id(id);
      if (el) el.value = '';
    });
    document
      .querySelectorAll('[data-purchase-status-tab]')
      .forEach((btn) => btn.classList.toggle('active', btn.dataset.purchaseStatusTab === ''));
    renderPurchases();
    if (purchases.length && hasActiveFilters() === false) showMessage('All purchases are visible.');
  }

  function clearDraft() {
    resetForm();
    closeForm();
    showMessage('Purchase draft cleared.');
  }

  function placeholder(action) {
    showMessage(A().placeholder(action).message, 'error');
  }

  function renderUI(state = {}) {
    if (Array.isArray(state.purchases)) {
      purchases = state.purchases;
      renderPurchases();
    }
    if (Array.isArray(state.suppliers)) {
      suppliers = state.suppliers;
      renderLookupData();
    }
    if (Array.isArray(state.products)) {
      products = state.products;
      renderLookupData();
    }
  }

  function updateUI(diff = {}) {
    renderUI(diff);
  }

  function destroyUI() {
    clearTimeout(messageTimer);
    messageTimer = null;
    $id('purchaseMessage')?.classList.add('hidden');
    closeForm();
    closeDetailModal();
  }

  function bindEvents() {
    $id('openPurchaseFormButton')?.addEventListener('click', openForm);
    document
      .querySelectorAll('[data-close-purchase-modal]')
      .forEach((el) => el.addEventListener('click', closeForm));
    document
      .querySelectorAll('[data-close-purchase-detail]')
      .forEach((el) => el.addEventListener('click', closeDetailModal));
    $id('purchaseForm')?.addEventListener('submit', savePurchase);
    $id('supplierForm')?.addEventListener('submit', saveQuickSupplier);
    $id('clearPurchaseDraftButton')?.addEventListener('click', clearDraft);
    $id('addPurchaseItemButton')?.addEventListener('click', addDraftItem);
    $id('purchaseItemProduct')?.addEventListener('change', fillSelectedProductPrices);
    ['purchaseDiscount', 'purchaseTax', 'purchasePaid'].forEach((id) =>
      $id(id)?.addEventListener('input', renderDraftItems)
    );
    [
      'purchaseKeywordSearch',
      'purchaseSupplierFilter',
      'purchaseMethodFilter',
      'purchasePaymentFilter',
      'purchaseFilterFrom',
      'purchaseFilterTo',
    ].forEach((id) => $id(id)?.addEventListener('input', renderPurchases));
    [
      'purchaseSupplierFilter',
      'purchaseMethodFilter',
      'purchasePaymentFilter',
      'purchaseFilterFrom',
      'purchaseFilterTo',
    ].forEach((id) => $id(id)?.addEventListener('change', renderPurchases));
    $id('purchaseClearFiltersButton')?.addEventListener('click', clearFilters);
    document.querySelectorAll('[data-purchase-status-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        document
          .querySelectorAll('[data-purchase-status-tab]')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderPurchases();
      })
    );
    $id('purchaseList')?.addEventListener('click', (event) => {
      const view = event.target.closest('[data-purchase-view]');
      if (view) viewPurchase(view.dataset.purchaseView).catch(() => {});
    });
    $id('purchaseItemsList')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-purchase-item]');
      if (remove) {
        draftItems.splice(Number(remove.dataset.removePurchaseItem), 1);
        renderDraftItems();
      }
    });
    ['purchasePrevPage', 'purchaseNextPage'].forEach((id) =>
      $id(id)?.addEventListener('click', () => placeholder('pagination'))
    );
  }

  async function initPurchasesModule() {
    if (!$id('purchaseList')) return;
    if (!initialized) {
      initialized = true;
      bindEvents();
    }
    setTodayIfEmpty('purchaseDate');
    clearFilters();
    await loadLookups();
    await loadPurchases();
  }

  window.initPurchasesModule = initPurchasesModule;
  window.PurchasesRenderer = {
    renderUI,
    updateUI,
    destroyUI,
    loadPurchases,
    refreshPurchaseLiveState,
  };
})();

/**
 * inventory.renderer.js — Inventory module UI controller
 *
 * Follows the same pattern as customers.renderer.js / suppliers.renderer.js.
 * Exposes: window.initInventoryModule (called by login.js navigateTo)
 * Load order: inventory.api.js, then inventory.renderer.js
 */
(function InventoryRendererModule() {
  'use strict';

  let initialized = false;
  let initPending = false;
  let _allItems = [];
  let _msgTimer = null;
  let _searchTimer = null;
  let _currentTab = 'all';
  let _page = 1;
  const PAGE_SIZE = 50;

  const LOG = () => {};

  function api() {
    return window.InventoryApi;
  }

  function $id(id) {
    return document.getElementById(id);
  }
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function money(v) {
    return `PKR ${Number(v || 0).toFixed(2)}`;
  }

  // ── Feedback ─────────────────────────────────────────────────────────────

  function showMsg(text, isError) {
    const el = $id('inventoryMessage');
    if (!el) return;
    el.textContent = text;
    el.style.cssText = isError
      ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;padding:8px 12px;border-radius:6px;margin-bottom:8px'
      : 'display:block;background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:8px 12px;border-radius:6px;margin-bottom:8px';
    el.classList.remove('hidden');
    clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  function renderStats(items) {
    const set = (id, v) => {
      const e = $id(id);
      if (e) e.textContent = v;
    };
    set('inventoryStatProducts', items.length);
    const value = items.reduce(
      (s, x) =>
        s + Number(x.currentStock || 0) * Number(x.lastPurchasePrice ?? x.purchasePrice ?? 0),
      0
    );
    const low = items.filter(
      (x) =>
        Number(x.currentStock || 0) > 0 &&
        Number(x.currentStock || 0) <= Number(x.minStockLevel || 0)
    ).length;
    const out = items.filter((x) => Number(x.currentStock || 0) <= 0).length;
    set('inventoryStatValue', money(value));
    set('inventoryStatLow', low);
    set('inventoryStatOut', out);
    set('inventoryStatVariants', items.length); // no variant model — same as total
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  function applyFilters(items) {
    const search = ($id('inventorySearch')?.value || '').trim().toLowerCase();
    const catId = $id('inventoryCategoryFilter')?.value || '';
    const brandId = $id('inventoryBrandFilter')?.value || '';
    const supplierId = $id('inventorySupplierFilter')?.value || '';
    const stockStat = $id('inventoryStockStatusFilter')?.value || '';
    let list = items;

    if (search) {
      list = list.filter(
        (x) =>
          (x.name || '').toLowerCase().includes(search) ||
          (x.sku || '').toLowerCase().includes(search) ||
          (x.barcode || '').toLowerCase().includes(search)
      );
    }
    if (catId) list = list.filter((x) => String(x.categoryId || '') === catId);
    if (brandId) list = list.filter((x) => String(x.brandId || '') === brandId);
    if (supplierId) list = list.filter((x) => String(x.supplierId || '') === supplierId);

    if (stockStat === 'in')
      list = list.filter((x) => Number(x.currentStock || 0) > Number(x.minStockLevel || 0));
    if (stockStat === 'low')
      list = list.filter(
        (x) =>
          Number(x.currentStock || 0) > 0 &&
          Number(x.currentStock || 0) <= Number(x.minStockLevel || 0)
      );
    if (stockStat === 'out') list = list.filter((x) => Number(x.currentStock || 0) <= 0);

    if (_currentTab === 'low')
      list = list.filter(
        (x) =>
          Number(x.currentStock || 0) > 0 &&
          Number(x.currentStock || 0) <= Number(x.minStockLevel || 0)
      );
    if (_currentTab === 'out') list = list.filter((x) => Number(x.currentStock || 0) <= 0);
    if (_currentTab === 'recent') list = list.slice(0, 50);

    return list;
  }

  function populateDropdown(selectId, items, labelKey, valKey) {
    const sel = $id(selectId);
    if (!sel) return;
    const current = sel.value;
    const seen = new Set();
    const opts = items
      .filter((x) => {
        const v = String(x[valKey] || '');
        if (!v || seen.has(v)) return false;
        seen.add(v);
        return true;
      })
      .map((x) => `<option value="${esc(x[valKey])}">${esc(x[labelKey])}</option>`);
    sel.innerHTML = `<option value="">${sel.options[0]?.text || 'All'}</option>` + opts.join('');
    sel.value = current;
  }

  function renderTable(items) {
    _allItems = items;
    renderStats(items);
    populateDropdown('inventoryCategoryFilter', items, 'categoryName', 'categoryId');
    populateDropdown('inventoryBrandFilter', items, 'brandName', 'brandId');
    populateDropdown('inventorySupplierFilter', items, 'supplierName', 'supplierId');

    const filtered = applyFilters(items);
    const rowsPerPage = Number($id('inventoryRowsPerPage')?.value || PAGE_SIZE);
    const start = (_page - 1) * rowsPerPage;
    const page = filtered.slice(start, start + rowsPerPage);

    const summary = $id('inventoryResultSummary');
    if (summary)
      summary.textContent = `Showing ${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

    const tbody = $id('inventoryTableBody');
    if (!tbody) return;
    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No items found.</td></tr>`;
      return;
    }
    tbody.innerHTML = page
      .map((x, i) => {
        const stock = Number(x.currentStock || 0);
        const minStock = Number(x.minStockLevel || 0);
        const isOut = stock <= 0;
        const isLow = !isOut && stock <= minStock;
        const statusColor = isOut ? '#dc2626' : isLow ? '#d97706' : '#16a34a';
        const statusLabel = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';
        return `<tr>
        <td style="color:#9ca3af;font-size:.75rem">${start + i + 1}</td>
        <td style="text-align:center">
          ${
            x.productImage
              ? `<img src="${esc(x.productImage)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px" />`
              : `<span style="display:inline-block;width:36px;height:36px;background:#f3f4f6;border-radius:4px;font-size:18px;line-height:36px;text-align:center">📦</span>`
          }
        </td>
        <td style="font-weight:600;font-size:.82rem">
          ${esc(x.name)}<br>
          <small style="color:#9ca3af;font-weight:400">${esc(x.sku || '—')}</small>
        </td>
        <td style="font-size:.75rem;color:#6b7280">${esc(x.batchNumber || '—')}</td>
        <td style="font-size:.75rem;color:#6b7280">${x.expirationDate ? new Date(x.expirationDate).toLocaleDateString() : '—'}</td>
        <td style="text-align:right;font-size:.78rem">${money(x.lastPurchasePrice ?? x.purchasePrice)}</td>
        <td style="text-align:right;font-size:.78rem">${money(x.purchasePrice)}</td>
        <td style="text-align:right;font-size:.78rem;font-weight:600">${money(x.salePrice)}</td>
        <td style="text-align:right;font-weight:700;font-size:.9rem;color:${statusColor}">${stock.toFixed(3)}</td>
        <td>
          <span style="padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600;background:${statusColor}20;color:${statusColor}">${statusLabel}</span>
        </td>
        <td style="white-space:nowrap;text-align:center">
          <button type="button" data-adjust-product="${x.productId}" data-product-name="${esc(x.name)}"
            style="padding:3px 8px;border:1px solid #f59e0b;color:#d97706;background:none;border-radius:5px;cursor:pointer;font-size:.72rem;margin-right:3px">Adjust</button>
        </td>
      </tr>`;
      })
      .join('');
  }

  // ── Load inventory ────────────────────────────────────────────────────────

  async function loadInventory(filters) {
    try {
      const res = await api().loadInventory(filters || {});
      if (!res?.ok) {
        showMsg(res?.message || 'Failed to load inventory.', true);
        return;
      }
      renderUI({ items: res.items || res.inventory || [] });
      LOG('loaded', (res.items || res.inventory || []).length, 'items');
    } catch (err) {
      LOG('loadInventory error:', err);
      showMsg('Failed to load inventory. Please try again.', true);
    }
  }

  // ── Stock Adjustment modal ────────────────────────────────────────────────

  function openAdjustModal(productId, productName) {
    const modal = $id('inventoryAdjustmentModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.removeAttribute('aria-hidden');
    const sel = $id('adjustProductId');
    if (sel) {
      // Populate with all products
      sel.innerHTML = _allItems
        .map(
          (x) =>
            `<option value="${x.productId}" ${String(x.productId) === String(productId) ? 'selected' : ''}>${esc(x.name)} (${Number(x.currentStock || 0).toFixed(2)})</option>`
        )
        .join('');
    }
    const reason = $id('adjustReason');
    if (reason) reason.value = '';
    const qty = $id('adjustQuantity');
    if (qty) {
      qty.value = '';
      qty.focus();
    }
  }

  function closeAdjustModal() {
    const modal = $id('inventoryAdjustmentModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    $id('stockAdjustmentForm')?.reset();
  }

  async function saveAdjustment(e) {
    e.preventDefault();
    const productId = Number($id('adjustProductId')?.value);
    const adjustmentType = $id('adjustmentType')?.value || 'IN';
    const quantity = parseFloat($id('adjustQuantity')?.value || '0');
    const reason = ($id('adjustReason')?.value || '').trim();
    if (!productId) {
      showMsg('Select a product.', true);
      return;
    }
    if (!quantity || quantity <= 0) {
      showMsg('Enter a valid quantity.', true);
      return;
    }
    if (!reason) {
      showMsg('Enter a reason for adjustment.', true);
      return;
    }
    const btn = $id('saveAdjustmentButton');
    if (btn) btn.disabled = true;
    try {
      const res = await api().adjustStock({
        productId,
        movementType: adjustmentType,
        quantity,
        reason,
      });
      if (!res?.ok) {
        showMsg(res?.message || 'Adjustment failed.', true);
        return;
      }
      showMsg(res.message || 'Stock adjusted.');
      closeAdjustModal();
      await loadInventory();
    } catch (err) {
      LOG('saveAdjustment error:', err);
      showMsg('Adjustment failed. Please try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderUI(state = {}) {
    if (Array.isArray(state.items)) {
      renderTable(state.items);
    }
  }

  function updateUI(diff = {}) {
    renderUI(diff);
  }

  function destroyUI() {
    clearTimeout(_searchTimer);
    _searchTimer = null;
    clearTimeout(_msgTimer);
    _msgTimer = null;
    $id('inventoryMessage')?.classList.add('hidden');
    closeAdjustModal();
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  function attachEvents() {
    LOG('attachEvents()');

    // Search
    $id('inventorySearch')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => renderTable(_allItems), 280);
    });

    // Filters
    [
      'inventoryCategoryFilter',
      'inventoryBrandFilter',
      'inventorySupplierFilter',
      'inventoryStockStatusFilter',
    ].forEach((id) =>
      $id(id)?.addEventListener('change', () => {
        _page = 1;
        renderTable(_allItems);
      })
    );
    $id('inventoryResetFiltersButton')?.addEventListener('click', () => {
      [
        'inventoryCategoryFilter',
        'inventoryBrandFilter',
        'inventorySupplierFilter',
        'inventoryStockStatusFilter',
      ].forEach((id) => {
        const el = $id(id);
        if (el) el.selectedIndex = 0;
      });
      const s = $id('inventorySearch');
      if (s) s.value = '';
      _page = 1;
      renderTable(_allItems);
    });

    // Tabs
    document.querySelectorAll('[data-inventory-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        _currentTab = btn.dataset.inventoryTab;
        document
          .querySelectorAll('[data-inventory-tab]')
          .forEach((b) => b.classList.toggle('active', b.dataset.inventoryTab === _currentTab));
        _page = 1;
        renderTable(_allItems);
      })
    );

    // Rows per page
    $id('inventoryRowsPerPage')?.addEventListener('change', () => {
      _page = 1;
      renderTable(_allItems);
    });

    // Table delegation — Adjust button
    $id('inventoryTableBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-adjust-product]');
      if (btn) openAdjustModal(btn.dataset.adjustProduct, btn.dataset.productName);
    });

    // Adjustment modal
    $id('openInventoryAdjustmentButton')?.addEventListener('click', () =>
      openAdjustModal(null, null)
    );
    document
      .querySelectorAll('[data-close-inventory-modal]')
      .forEach((el) => el.addEventListener('click', () => closeAdjustModal()));
    $id('stockAdjustmentForm')?.addEventListener('submit', (e) => saveAdjustment(e));

    // Toolbar placeholders
    $id('inventoryBulkButton')?.addEventListener('click', () => {
      showMsg(api().placeholder('bulk').message, true);
    });
    $id('inventoryTransferButton')?.addEventListener('click', () => {
      showMsg(api().placeholder('transfer').message, true);
    });
    $id('inventoryBarcodeButton')?.addEventListener('click', () => {
      showMsg(api().placeholder('barcode').message, true);
    });
    document.querySelectorAll('[data-page-tool="inventory"]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const action = btn.dataset.toolAction === 'import' ? 'import' : 'export';
        showMsg(api().placeholder(action).message, true);
      })
    );
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!$id('inventoryTableBody')) {
      if (initPending) return;
      initPending = true;
      setTimeout(() => {
        initPending = false;
        init();
      }, 80);
      return;
    }
    if (!initialized) {
      initialized = true;
      attachEvents();
    }
    _page = 1;
    _currentTab = 'all';
    loadInventory();
    LOG('init() complete');
  }

  window.initInventoryModule = init;
  window.InventoryRenderer = {
    renderUI,
    updateUI,
    destroyUI,
    loadInventory,
  };
})();

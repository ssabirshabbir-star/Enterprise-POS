/**
 * products.renderer.js — Products Module Entry Point
 *
 * File:      src/main/features/products/products.renderer.js
 * Reason:    Renderer layer for Products module (Phase 4) — matches billing pattern
 * Risk:      LOW — UI state only, no business logic, no IPC calls
 * Rollback:  Delete file; remove script tags and login.js hook
 *
 * RESPONSIBILITY: Module initialization, DOM event binding, and display state ONLY.
 *   Delegates all posApi calls to window.ProductsApi.
 * Exposes: window.ProductsRenderer (display state + render functions)
 *          window.initProductsModule (called by login.js on /products navigation)
 *
 * Load order:
 *   1. products.api.js     → defines window.ProductsApi
 *   2. products.renderer.js → defines window.ProductsRenderer + window.initProductsModule
 *
 * NOT ALLOWED in this file:
 *   - window.posApi calls  (belongs in products.api.js)
 *   - Business logic        (belongs in product.service.js)
 *   - Validation            (belongs in product.validation.js)
 */
(function ProductsRendererModule() {
  'use strict';

  // ── Module lifecycle flags ────────────────────────────────────────────────
  // initialized:  true after first successful init() — prevents re-binding
  // initPending:  prevents concurrent retry chains before fragment loads
  let initialized = false;
  let initPending = false;

  /** Lightweight, removable logger — non-intrusive, no side effects */
  const LOG = () => {};

  /** Live reference — resolved at call-time */
  const A = () => window.ProductsApi;

  // ── Display state (presentation layer only) ───────────────────────────────

  let _canWrite = false; // set from API response permissions field
  let _currentTab = 'all'; // active tab key
  let _searchTimer = null; // debounce handle for search input
  let _catalog = { categories: [], brands: [], units: [] };

  // Current filter state — read by products.api.js via getCurrentFilters()
  function getCurrentFilters() {
    return {
      search: document.getElementById('productSearch')?.value?.trim() || '',
      category: document.getElementById('productCategoryFilter')?.value || '',
      brand: document.getElementById('productBrandFilter')?.value || '',
      unit: document.getElementById('productUnitFilter')?.value || '',
      stockStatus: document.getElementById('productStockFilter')?.value || '',
      tab: _currentTab,
    };
  }

  function setCanWrite(flag) {
    _canWrite = Boolean(flag);
  }

  // ── DOM / format utilities ────────────────────────────────────────────────

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
  function fmt(v) {
    return Number(v || 0).toFixed(2);
  }

  // ── Feedback display ──────────────────────────────────────────────────────

  let _msgTimer = null;

  function showMsg(text, isError) {
    const el = $id('productMessage');
    if (!el) return;
    el.textContent = text;
    el.className = isError ? 'rounded-md px-3 py-2 text-sm' : 'rounded-md px-3 py-2 text-sm';
    el.style.cssText = isError
      ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;margin-bottom:8px'
      : 'display:block;background:#f0fdf4;color:#166534;border:1px solid #86efac;margin-bottom:8px';
    el.classList.remove('hidden');
    clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  function showFormMsg(text, isError) {
    // Display error inside the product form modal (near save button)
    const footer = document.querySelector('#productForm .pf-footer');
    let el = $id('productFormMsg');
    if (!el && footer) {
      el = document.createElement('p');
      el.id = 'productFormMsg';
      el.style.cssText = 'margin:6px 0 0;font-size:.78rem;font-weight:600';
      footer.prepend(el);
    }
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#b91c1c' : '#166534';
  }

  // ── Stats display ─────────────────────────────────────────────────────────

  function renderStats(count) {
    if (!count) return;
    const set = (id, v) => {
      const e = $id(id);
      if (e) e.textContent = v;
    };
    set('productTotalCount', count.total ?? 0);
    set('productActiveCount', count.active ?? 0);
    set('productLowStockCount', count.lowStock ?? 0);
    set('productOutOfStockCount', count.outOfStock ?? 0);
    set(
      'productTotalValue',
      count.totalValue != null ? `Rs.${Number(count.totalValue).toLocaleString()}` : '—'
    );
  }

  // ── Product table rendering ───────────────────────────────────────────────

  function renderProductTable(products) {
    const tbody = $id('productTableBody');
    const empty = $id('productEmptyState');
    const summary = $id('productResultSummary');
    if (!tbody) return;

    if (summary)
      summary.textContent = `Showing ${products.length} product${products.length !== 1 ? 's' : ''}`;

    if (!products.length) {
      tbody.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    tbody.innerHTML = products
      .map((p) => {
        const stockColor =
          p.currentStock <= 0
            ? '#dc2626'
            : p.currentStock < (p.minStockLevel || 5)
              ? '#d97706'
              : '#16a34a';
        const statusBadge = p.isActive
          ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Active</span>'
          : '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Inactive</span>';
        const actions = _canWrite
          ? `
        <button type="button" data-edit-product="${p.id}"
          style="padding:3px 10px;border:1px solid #3b82f6;color:#3b82f6;background:none;border-radius:5px;cursor:pointer;font-size:.75rem;margin-right:4px">Edit</button>
        <button type="button" data-delete-product="${p.id}" data-product-name="${esc(p.name)}"
          style="padding:3px 10px;border:1px solid #ef4444;color:#ef4444;background:none;border-radius:5px;cursor:pointer;font-size:.75rem">Delete</button>
      `
          : '<span style="color:#9ca3af;font-size:.75rem">View only</span>';

        return `<tr>
        <td style="font-weight:600;font-size:.82rem">${esc(p.name)}</td>
        <td style="color:#6b7280;font-size:.78rem">${esc(p.sku || '—')}</td>
        <td style="color:#6b7280;font-size:.78rem">${esc(p.barcode || '—')}</td>
        <td style="font-size:.78rem">${esc(p.categoryName || '—')}</td>
        <td style="font-size:.78rem">${esc(p.brandName || '—')}</td>
        <td style="font-size:.78rem">${esc(p.unitShortName || p.unitName || '—')}</td>
        <td style="text-align:right;font-size:.78rem">Rs.${fmt(p.purchasePrice)}</td>
        <td style="text-align:right;font-weight:600;font-size:.82rem">Rs.${fmt(p.salePrice)}</td>
        <td style="text-align:center;font-weight:700;font-size:.82rem;color:${stockColor}">${p.currentStock}</td>
        <td style="text-align:center">${statusBadge}</td>
        <td style="text-align:center;white-space:nowrap">${actions}</td>
      </tr>`;
      })
      .join('');
  }

  // ── Catalog dropdowns + lists ─────────────────────────────────────────────

  function renderCatalogDropdowns(catalog) {
    _catalog = catalog;
    const fill = (id, items, labelKey = 'name', extra = '') => {
      const el = $id(id);
      if (!el) return;
      const saved = el.value;
      el.innerHTML =
        `<option value="">— Select —</option>${extra}` +
        (items || [])
          .map((i) => `<option value="${i.id}">${esc(i[labelKey] || i.name)}</option>`)
          .join('');
      el.value = saved; // restore selection
    };
    // Form dropdowns
    fill('productCategory', catalog.categories);
    fill('productBrand', catalog.brands);
    fill('productUnit', catalog.units);
    // Filter bar dropdowns
    const fillFilter = (id, items) => {
      const el = $id(id);
      if (!el) return;
      const saved = el.value;
      el.innerHTML =
        `<option value="">All</option>` +
        (items || []).map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
      el.value = saved;
    };
    fillFilter('productCategoryFilter', catalog.categories);
    fillFilter('productBrandFilter', catalog.brands);
    fillFilter('productUnitFilter', catalog.units);
  }

  function renderCatalogLists(catalog) {
    const renderList = (elId, items, type) => {
      const el = $id(elId);
      if (!el) return;
      if (!items?.length) {
        el.innerHTML = '<p style="color:#9ca3af;font-size:.75rem;padding:4px">None yet.</p>';
        return;
      }
      el.innerHTML = items
        .map(
          (i) =>
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:.76rem">
          <span>${esc(i.name)}${i.shortName ? ` (${esc(i.shortName)})` : ''}</span>
          ${
            _canWrite
              ? `<button type="button" data-catalog-delete="${type}" data-catalog-id="${i.id}" data-catalog-name="${esc(i.name)}"
            style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:.8rem;padding:0 4px">✕</button>`
              : ''
          }
        </div>`
        )
        .join('');
    };
    renderList('categoryList', catalog.categories, 'categories');
    renderList('brandList', catalog.brands, 'brands');
    renderList('unitList', catalog.units, 'units');
  }

  // ── Product form (modal in renderer/index.html shell) ────────────────────

  function openProductForm(product) {
    const panel = $id('productFormPanel');
    if (!panel) return;
    const title = $id('productFormTitle');
    const set = (id, v) => {
      const e = $id(id);
      if (e) e.value = v ?? '';
    };

    if (product) {
      // Edit mode — populate fields
      if (title) title.textContent = 'Edit Product';
      set('productId', product.id);
      set('productName', product.name);
      set('productSku', product.sku);
      set('productBarcode', product.barcode);
      set('productCategory', product.categoryId);
      set('productBrand', product.brandId);
      set('productUnit', product.unitId);
      set('purchasePrice', product.purchasePrice);
      set('salePrice', product.salePrice);
      set('wholesalePrice', product.wholesalePrice);
      set('minStockLevel', product.minStockLevel);
      set('currentStock', product.currentStock);
      const allowOverrideEl = $id('allowSalePriceOverride');
      if (allowOverrideEl) allowOverrideEl.checked = product.allowSalePriceOverride === true;
      const autoUpdateEl = $id('autoUpdateSalePriceFromPurchase');
      if (autoUpdateEl) autoUpdateEl.checked = product.autoUpdateSalePriceFromPurchase === true;
      const trackExpiryEl = $id('trackExpiry');
      if (trackExpiryEl) trackExpiryEl.checked = product.trackExpiry === true;
      const expiryRequiredEl = $id('expiryRequired');
      if (expiryRequiredEl) expiryRequiredEl.checked = product.expiryRequired === true;
      set('expiryAlertDays', product.expiryAlertDays ?? '');
      const activeEl = $id('productActive');
      if (activeEl) activeEl.checked = Boolean(product.isActive);
    } else {
      // Add mode — clear form
      if (title) title.textContent = 'Add Product';
      $id('productForm')?.reset();
      const idEl = $id('productId');
      if (idEl) idEl.value = '';
      [
        'allowSalePriceOverride',
        'autoUpdateSalePriceFromPurchase',
        'trackExpiry',
        'expiryRequired',
      ].forEach((id) => {
        const el = $id(id);
        if (el) el.checked = false;
      });
      set('expiryAlertDays', '');
    }

    // Clear any previous form msg
    const msgEl = $id('productFormMsg');
    if (msgEl) msgEl.textContent = '';
    panel.style.display = 'flex';
    panel.classList.remove('hidden');
    setTimeout(() => $id('productName')?.focus(), 40);
  }

  function closeProductForm() {
    const panel = $id('productFormPanel');
    if (!panel) return;
    panel.style.display = 'none';
    panel.classList.add('hidden');
    $id('productForm')?.reset();
    const idEl = $id('productId');
    if (idEl) idEl.value = '';
    $id('pfCatalogPanel')?.classList.add('hidden');
  }

  // ── Tab state ─────────────────────────────────────────────────────────────

  function setActiveTab(tab) {
    _currentTab = tab;
    document.querySelectorAll('[data-product-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.productTab === tab);
    });
  }

  // ── Event binding (idempotent — runs exactly once per session) ─────────────

  function attachEvents() {
    LOG('attachEvents() — runs once per session');

    // ── Search with debounce ─────────────────────────────────────────────────
    $id('productSearch')?.addEventListener('input', (e) => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => A().loadProducts(getCurrentFilters()), 300);
    });

    // ── Filter selects ────────────────────────────────────────────────────────
    [
      'productCategoryFilter',
      'productBrandFilter',
      'productUnitFilter',
      'productStockFilter',
    ].forEach((id) =>
      $id(id)?.addEventListener('change', () => A().loadProducts(getCurrentFilters()))
    );

    // ── Reset filters ─────────────────────────────────────────────────────────
    $id('productResetFiltersButton')?.addEventListener('click', () => {
      [
        'productSearch',
        'productCategoryFilter',
        'productBrandFilter',
        'productUnitFilter',
        'productStockFilter',
      ].forEach((id) => {
        const el = $id(id);
        if (el) el.value = '';
      });
      setActiveTab('all');
      A().loadProducts(getCurrentFilters());
    });

    // ── Tab switching ─────────────────────────────────────────────────────────
    document.querySelectorAll('[data-product-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        setActiveTab(btn.dataset.productTab);
        A().loadProducts(getCurrentFilters());
      })
    );

    // ── Add product button ────────────────────────────────────────────────────
    $id('newProductButton')?.addEventListener('click', async () => {
      await A().loadCatalog(); // ensure dropdowns populated
      openProductForm(null);
    });

    // ── Product table — edit / delete (event delegation) ─────────────────────
    $id('productTableBody')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-product]');
      if (editBtn) {
        A().loadProductForEdit(Number(editBtn.dataset.editProduct));
        return;
      }

      const delBtn = e.target.closest('[data-delete-product]');
      if (delBtn)
        A().deleteProduct(Number(delBtn.dataset.deleteProduct), delBtn.dataset.productName);
    });

    // ── Product form save (inside shell modal) ────────────────────────────────
    $id('productForm')?.addEventListener('submit', (e) => A().saveProduct(e));

    // ── Close product form ────────────────────────────────────────────────────
    $id('closeProductFormButton')?.addEventListener('click', () => closeProductForm());

    // ── Barcode print button ──────────────────────────────────────────────────
    $id('barcodePrintButton')?.addEventListener('click', () => A().printBarcode());

    // ── Catalog panel toggle ──────────────────────────────────────────────────
    $id('pfCatalogToggle')?.addEventListener('click', () => {
      const panel = $id('pfCatalogPanel');
      if (!panel) return;
      const isHidden = panel.classList.contains('hidden');
      if (isHidden) {
        A().loadCatalog();
        panel.classList.remove('hidden');
      } else panel.classList.add('hidden');
    });

    // ── Catalog forms — add item (event delegation on each catalogForm) ────────
    document
      .querySelectorAll('.catalogForm')
      .forEach((form) => form.addEventListener('submit', (e) => A().saveCatalogItem(e)));

    // ── Catalog lists — delete item (event delegation) ────────────────────────
    ['categoryList', 'brandList', 'unitList'].forEach((listId) =>
      $id(listId)?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-catalog-delete]');
        if (!btn) return;
        A().deleteCatalogItem(
          btn.dataset.catalogDelete,
          Number(btn.dataset.catalogId),
          btn.dataset.catalogName
        );
      })
    );

    // ── Import / Export tool buttons ──────────────────────────────────────────
    document
      .querySelectorAll('[data-page-tool="products"]')
      .forEach((btn) =>
        btn.addEventListener('click', () => A().handleToolAction(btn.dataset.toolAction))
      );
  }

  // ── Module init ───────────────────────────────────────────────────────────
  // Called by login.js after /products navigation (safe to call multiple times).
  //
  // Lifecycle:
  //   1st call (fragment not yet in DOM) → schedules retry, sets initPending
  //   2nd call before retry fires        → returns immediately (initPending guard)
  //   retry fires                        → clears initPending, re-enters init()
  //   fragment now in DOM                → runs attachEvents() once, then refresh
  //   subsequent calls (re-navigation)   → skips attachEvents(), only reloads data

  function init() {
    if (!$id('productTableBody')) {
      if (initPending) return; // a retry is already scheduled
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

    // Reload data on every /products navigation (no listeners added here)
    const filters = getCurrentFilters();
    A().loadCatalog();
    A().loadProducts(filters);
    A().loadStats();
    LOG('init() complete — module ready');
  }

  // ── Public surface ────────────────────────────────────────────────────────
  // products.api.js reads display state and calls render functions via this surface.

  window.ProductsRenderer = {
    // State accessors
    getCurrentFilters,
    setCanWrite,
    // Rendering
    renderStats,
    renderProductTable,
    renderCatalogDropdowns,
    renderCatalogLists,
    // Form management
    openProductForm,
    closeProductForm,
    // Feedback
    showMsg,
    showFormMsg,
    // Utilities (shared with api.js)
    esc,
    fmt,
  };

  window.initProductsModule = init;
})();

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
  const UIX = () => window.EposUI;

  const UI = {
    ids: {
      message: 'productMessage',
      search: 'productSearch',
      categoryFilter: 'productCategoryFilter',
      brandFilter: 'productBrandFilter',
      unitFilter: 'productUnitFilter',
      stockFilter: 'productStockFilter',
      resetFiltersButton: 'productResetFiltersButton',
      newProductButton: 'newProductButton',
      tableBody: 'productTableBody',
      emptyState: 'productEmptyState',
      resultSummary: 'productResultSummary',
      formPanel: 'productFormPanel',
      formTitle: 'productFormTitle',
      form: 'productForm',
      formMessage: 'productFormMsg',
      closeFormButton: 'closeProductFormButton',
      barcodePrintButton: 'barcodePrintButton',
      catalogToggle: 'pfCatalogToggle',
      catalogPanel: 'pfCatalogPanel',
      categoryList: 'categoryList',
      brandList: 'brandList',
      unitList: 'unitList',
    },
    selectors: {
      formFooter: '#productForm .pf-footer',
      tab: '[data-product-tab]',
      editProduct: '[data-edit-product]',
      deleteProduct: '[data-delete-product]',
      catalogForm: '.catalogForm',
      catalogDelete: '[data-catalog-delete]',
      pageTool: '[data-page-tool="products"]',
    },
    filterIds: [
      'productCategoryFilter',
      'productBrandFilter',
      'productUnitFilter',
      'productStockFilter',
    ],
    resetIds: [
      'productSearch',
      'productCategoryFilter',
      'productBrandFilter',
      'productUnitFilter',
      'productStockFilter',
    ],
  };

  // ── Display state (presentation layer only) ───────────────────────────────

  let _canWrite = false; // set from API response permissions field
  let _currentTab = 'all'; // active tab key
  let _searchTimer = null; // debounce handle for search input

  // Current filter state — read by products.api.js via getCurrentFilters()
  function getCurrentFilters() {
    return {
      search: $id('search')?.value?.trim() || '',
      category: $id('categoryFilter')?.value || '',
      brand: $id('brandFilter')?.value || '',
      unit: $id('unitFilter')?.value || '',
      stockStatus: $id('stockFilter')?.value || '',
      tab: _currentTab,
    };
  }

  function setCanWrite(flag) {
    _canWrite = Boolean(flag);
  }

  function checkFeature(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  function requireFeature(featureId) {
    const gate = checkFeature(featureId);
    if (!gate.ok && gate.visible !== false) showMsg(gate.message, true);
    return gate.ok;
  }

  // ── DOM / format utilities ────────────────────────────────────────────────

  function $id(key) {
    return document.getElementById(UI.ids[key] || key);
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
    const el = $id('message');
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
    const footer = document.querySelector(UI.selectors.formFooter);
    let el = $id('formMessage');
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
    const tbody = $id('tableBody');
    const empty = $id('emptyState');
    const summary = $id('resultSummary');
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
          ? UIX().Badge.render({ label: 'Active', variant: 'active' })
          : UIX().Badge.render({ label: 'Inactive', variant: 'inactive' });
        const actions = _canWrite
          ? `
        ${UIX().Button.render({ label: 'Edit', variant: 'blue', className: 'epos-ui-button-gap', attrs: { 'data-edit-product': p.id } })}
        ${UIX().Button.render({ label: 'Delete', variant: 'danger', attrs: { 'data-delete-product': p.id, 'data-product-name': p.name } })}
      `
          : UIX().Badge.render({ label: 'View only', variant: 'muted' });

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
        el.innerHTML = UIX().Panel.render({
          children: 'None yet.',
          className: 'epos-products-catalog-empty',
        });
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
    const panel = $id('formPanel');
    if (!panel) return;
    const title = $id('formTitle');
    const policySection = $id('productPolicySection');
    if (policySection) policySection.open = false;
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
      $id('form')?.reset();
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
    const msgEl = $id('formMessage');
    if (msgEl) msgEl.textContent = '';
    panel.style.display = 'flex';
    panel.classList.remove('hidden');
    setTimeout(() => $id('productName')?.focus(), 40);
  }

  function closeProductForm() {
    const panel = $id('formPanel');
    if (!panel) return;
    panel.style.display = 'none';
    panel.classList.add('hidden');
    $id('form')?.reset();
    const idEl = $id('productId');
    if (idEl) idEl.value = '';
    $id('catalogPanel')?.classList.add('hidden');
  }

  // ── Tab state ─────────────────────────────────────────────────────────────

  function setActiveTab(tab) {
    _currentTab = tab;
    document.querySelectorAll(UI.selectors.tab).forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.productTab === tab);
    });
  }

  function buildProductPayload() {
    return {
      name: ($id('productName')?.value || '').trim(),
      sku: ($id('productSku')?.value || '').trim() || undefined,
      barcode: ($id('productBarcode')?.value || '').trim() || undefined,
      categoryId: Number($id('productCategory')?.value) || null,
      brandId: Number($id('productBrand')?.value) || null,
      unitId: Number($id('productUnit')?.value) || null,
      purchasePrice: parseFloat($id('purchasePrice')?.value || '0') || 0,
      salePrice: parseFloat($id('salePrice')?.value || '0') || 0,
      wholesalePrice: parseFloat($id('wholesalePrice')?.value || '0') || 0,
      minStockLevel: parseFloat($id('minStockLevel')?.value || '0') || 0,
      currentStock: parseFloat($id('currentStock')?.value || '0') || 0,
      allowSalePriceOverride: $id('allowSalePriceOverride')?.checked === true,
      autoUpdateSalePriceFromPurchase: $id('autoUpdateSalePriceFromPurchase')?.checked === true,
      trackExpiry: $id('trackExpiry')?.checked === true,
      expiryRequired: $id('expiryRequired')?.checked === true,
      expiryAlertDays: $id('expiryAlertDays')?.value || null,
      isActive: $id('productActive')?.checked ?? true,
    };
  }

  function buildCatalogPayload(form) {
    return {
      name: (form.querySelector('input[name="name"]')?.value || '').trim(),
      description:
        (form.querySelector('input[name="description"]')?.value || '').trim() || undefined,
      shortName: (form.querySelector('input[name="shortName"]')?.value || '').trim() || undefined,
    };
  }

  async function refreshProducts(filters) {
    const res = await A().loadProducts(filters || getCurrentFilters());
    if (!res?.ok) {
      showMsg(res?.message || 'Unable to load products. Please try again.', true);
      return res;
    }
    setCanWrite(res.permissions?.canWrite ?? false);
    renderProductTable(res.products || []);
    return res;
  }

  async function refreshStats() {
    const res = await A().loadStats();
    if (res?.ok) renderStats(res.count || {});
    return res;
  }

  async function refreshCatalog(showError) {
    const res = await A().loadCatalog();
    if (!res?.ok) {
      if (showError) showMsg(res?.message || 'Unable to load categories, brands, and units.', true);
      return res;
    }
    renderCatalogDropdowns(res.catalog);
    renderCatalogLists(res.catalog);
    return res;
  }

  async function saveProductFromForm(e) {
    e.preventDefault();
    const productId = $id('productId')?.value;
    const saveBtn = $id('saveProductButton');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const res = await A().saveProduct(productId, buildProductPayload());
      if (!res?.ok) {
        showFormMsg(res?.message || 'Unable to save product. Please try again.', true);
        return;
      }
      showMsg(res.message || 'Product saved.');
      closeProductForm();
      await refreshProducts(getCurrentFilters());
      await refreshStats();
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function loadProductForEdit(productId) {
    const catalogRes = await refreshCatalog(true);
    if (!catalogRes?.ok) return;
    const res = await A().loadProductForEdit(productId);
    if (!res?.ok) {
      showMsg(res?.message || 'Unable to load product for editing. Please try again.', true);
      return;
    }
    openProductForm(res.product);
  }

  async function deleteProductFromTable(productId, productName) {
    const confirmed = await window.posApi.dialog.confirm(
      `Delete "${productName}"? This action cannot be undone.`
    );
    window.focus?.();
    if (!confirmed) return;
    const res = await A().deleteProduct(productId);
    if (!res?.ok) {
      showMsg(res?.message || 'Unable to delete product. Please try again.', true);
      return;
    }
    showMsg(res.message || 'Product deleted.');
    await refreshProducts(getCurrentFilters());
    await refreshStats();
  }

  async function printBarcodeFromForm() {
    const res = await A().printBarcode($id('productId')?.value);
    showMsg(res?.message || 'Unable to print barcode.', !res?.ok);
  }

  async function saveCatalogItemFromForm(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await A().saveCatalogItem(form.dataset.type, buildCatalogPayload(form));
      if (!res?.ok) {
        showMsg(res?.message || `Unable to save ${form.dataset.type}. Please try again.`, true);
        return;
      }
      showMsg(res.message || `${form.dataset.type} saved.`);
      form.reset();
      await refreshCatalog(true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function deleteCatalogItemFromList(type, id, name) {
    const confirmed = await window.posApi.dialog.confirm(`Delete "${name}"?`);
    window.focus?.();
    if (!confirmed) return;
    const res = await A().deleteCatalogItem(type, id);
    if (!res?.ok) {
      showMsg(res?.message || `Unable to delete ${type}. Please try again.`, true);
      return;
    }
    showMsg(res.message || `${type} deleted.`);
    await refreshCatalog(true);
  }

  function renderUI(state) {
    if (state?.products) renderProductTable(state.products);
    if (state?.stats) renderStats(state.stats);
    if (state?.catalog) {
      renderCatalogDropdowns(state.catalog);
      renderCatalogLists(state.catalog);
    }
  }

  function updateUI(diff) {
    renderUI(diff || {});
  }

  function destroyUI() {
    // TODO: Add teardown when Products gains route-level unmounting.
  }

  // ── Event binding (idempotent — runs exactly once per session) ─────────────

  function attachEvents() {
    LOG('attachEvents() — runs once per session');

    // ── Search with debounce ─────────────────────────────────────────────────
    $id('search')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => refreshProducts(getCurrentFilters()), 300);
    });

    // ── Filter selects ────────────────────────────────────────────────────────
    UI.filterIds.forEach((id) =>
      $id(id)?.addEventListener('change', () => refreshProducts(getCurrentFilters()))
    );

    // ── Reset filters ─────────────────────────────────────────────────────────
    $id('resetFiltersButton')?.addEventListener('click', () => {
      UI.resetIds.forEach((id) => {
        const el = $id(id);
        if (el) el.value = '';
      });
      setActiveTab('all');
      refreshProducts(getCurrentFilters());
    });

    // ── Tab switching ─────────────────────────────────────────────────────────
    document.querySelectorAll(UI.selectors.tab).forEach((btn) =>
      btn.addEventListener('click', () => {
        setActiveTab(btn.dataset.productTab);
        refreshProducts(getCurrentFilters());
      })
    );

    // ── Add product button ────────────────────────────────────────────────────
    $id('newProductButton')?.addEventListener('click', async () => {
      await refreshCatalog(true); // ensure dropdowns populated
      openProductForm(null);
    });

    // ── Product table — edit / delete (event delegation) ─────────────────────
    $id('tableBody')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest(UI.selectors.editProduct);
      if (editBtn) {
        loadProductForEdit(Number(editBtn.dataset.editProduct));
        return;
      }

      const delBtn = e.target.closest(UI.selectors.deleteProduct);
      if (delBtn)
        deleteProductFromTable(Number(delBtn.dataset.deleteProduct), delBtn.dataset.productName);
    });

    // ── Product form save (inside shell modal) ────────────────────────────────
    $id('form')?.addEventListener('submit', saveProductFromForm);

    // ── Close product form ────────────────────────────────────────────────────
    $id('closeFormButton')?.addEventListener('click', () => closeProductForm());

    // ── Barcode print button ──────────────────────────────────────────────────
    $id('barcodePrintButton')?.addEventListener('click', printBarcodeFromForm);

    // ── Catalog panel toggle ──────────────────────────────────────────────────
    $id('catalogToggle')?.addEventListener('click', () => {
      if (!requireFeature('products.catalog_management')) return;
      const panel = $id('catalogPanel');
      if (!panel) return;
      const isHidden = panel.classList.contains('hidden');
      if (isHidden) {
        refreshCatalog(true);
        panel.classList.remove('hidden');
      } else panel.classList.add('hidden');
    });

    // ── Catalog forms — add item (event delegation on each catalogForm) ────────
    document
      .querySelectorAll(UI.selectors.catalogForm)
      .forEach((form) => form.addEventListener('submit', saveCatalogItemFromForm));

    // ── Catalog lists — delete item (event delegation) ────────────────────────
    ['categoryList', 'brandList', 'unitList'].forEach((listId) =>
      $id(listId)?.addEventListener('click', (e) => {
        const btn = e.target.closest(UI.selectors.catalogDelete);
        if (!btn) return;
        deleteCatalogItemFromList(
          btn.dataset.catalogDelete,
          Number(btn.dataset.catalogId),
          btn.dataset.catalogName
        );
      })
    );

    // ── Import / Export tool buttons ──────────────────────────────────────────
    document.querySelectorAll(UI.selectors.pageTool).forEach((btn) =>
      btn.addEventListener('click', () => {
        const res = A().getToolActionMessage(btn.dataset.toolAction);
        showMsg(res.message, true);
      })
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
    if (!$id('tableBody')) {
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
    refreshCatalog();
    refreshProducts(filters);
    refreshStats();
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
    // Lifecycle contract
    renderUI,
    updateUI,
    destroyUI,
  };

  window.initProductsModule = init;
})();

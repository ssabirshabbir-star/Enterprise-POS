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
      catalogPanel: 'pfCatalogPanel',
      catalogList: 'pfCatalogList',
    },
    selectors: {
      formFooter: '#productForm .pf-footer',
      tab: '[data-product-tab]',
      editProduct: '[data-edit-product]',
      printBarcodeProduct: '[data-print-barcode-product]',
      deleteProduct: '[data-delete-product]',
      catalogForm: '.catalogForm',
      catalogDelete: '[data-catalog-delete]',
      catalogClose: '[data-catalog-close]',
      pageTool: '[data-page-tool="products"]',
    },
    filterIds: ['productCategoryFilter', 'productBrandFilter', 'productUnitFilter'],
    resetIds: ['productSearch', 'productCategoryFilter', 'productBrandFilter', 'productUnitFilter'],
  };

  // ── Display state (presentation layer only) ───────────────────────────────

  let _canWrite = false; // set from API response permissions field
  let _currentTab = 'all'; // active tab key
  let _searchTimer = null; // debounce handle for search input
  let _productRefreshSeq = 0; // prevents stale async list responses from repainting the table
  let _activeCatalogType = null;
  let _productSaveInFlight = false;
  let _catalogSaveInFlight = false;
  const _catalogCache = {
    categories: [],
    brands: [],
    units: [],
    variants: [],
  };
  const CATALOG_CONFIG = Object.freeze({
    categories: {
      label: 'Category',
      formSelect: 'productCategory',
      filterSelect: 'productCategoryFilter',
    },
    brands: {
      label: 'Brand',
      formSelect: 'productBrand',
      filterSelect: 'productBrandFilter',
    },
    units: {
      label: 'Unit',
      formSelect: 'productUnit',
      filterSelect: 'productUnitFilter',
      usesShortName: true,
    },
    variants: {
      label: 'Variant',
      formSelect: 'productVariantCatalogPreview',
      placeholder: '— Select variant —',
    },
  });

  // Current filter state — read by products.api.js via getCurrentFilters()
  function getCurrentFilters() {
    const stockTabs = ['in', 'low', 'out'];
    const stockStatus = stockTabs.includes(_currentTab) ? _currentTab : '';
    const tab = stockStatus ? 'all' : _currentTab;

    return {
      search: $id('search')?.value?.trim() || '',
      category: $id('categoryFilter')?.value || '',
      brand: $id('brandFilter')?.value || '',
      unit: $id('unitFilter')?.value || '',
      stockStatus,
      tab,
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
        ${UIX().Button.render({ label: 'Print Barcode', variant: 'blue', className: 'epos-products-barcode-action epos-ui-button-gap', attrs: { 'data-print-barcode-product': p.id } })}
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

  function renderCatalogType(type, items, selectedId) {
    const config = CATALOG_CONFIG[type];
    if (!config) return;
    _catalogCache[type] = items || [];

    const formSelect = $id(config.formSelect);
    if (formSelect) {
      const saved = selectedId ?? formSelect.value;
      formSelect.innerHTML =
        `<option value="">${config.placeholder || '— Select —'}</option>` +
        _catalogCache[type]
          .map((item) => `<option value="${item.id}">${esc(item.name)}</option>`)
          .join('');
      formSelect.value = String(saved ?? '');
    }

    const filterSelect = config.filterSelect ? $id(config.filterSelect) : null;
    if (filterSelect) {
      const saved = filterSelect.value;
      filterSelect.innerHTML =
        '<option value="">All</option>' +
        _catalogCache[type]
          .map((item) => `<option value="${item.id}">${esc(item.name)}</option>`)
          .join('');
      filterSelect.value = saved;
    }

    renderActiveCatalogList();
  }

  function renderCatalogDropdowns(catalog) {
    Object.keys(CATALOG_CONFIG).forEach((type) => renderCatalogType(type, catalog[type] || []));
  }

  function renderActiveCatalogList() {
    const el = $id('catalogList');
    const items = _catalogCache[_activeCatalogType] || [];
    if (!el || !_activeCatalogType) return;
    if (!items.length) {
      el.innerHTML = UIX().Panel.render({
        children: 'No entries yet.',
        className: 'epos-products-catalog-empty',
      });
      return;
    }
    el.innerHTML = items
      .map(
        (item) =>
          `<div class="pf-catalog-list-item">
          <span>${esc(item.name)}${item.shortName ? ` (${esc(item.shortName)})` : ''}</span>
          ${
            _canWrite
              ? `<button type="button" data-catalog-delete="${_activeCatalogType}" data-catalog-id="${item.id}" data-catalog-name="${esc(item.name)}" aria-label="Delete ${esc(item.name)}">Delete</button>`
              : ''
          }
        </div>`
      )
      .join('');
  }

  function renderCatalogLists(catalog) {
    Object.keys(CATALOG_CONFIG).forEach((type) => {
      _catalogCache[type] = catalog[type] || [];
    });
    renderActiveCatalogList();
  }

  function syncExpiryPolicyState() {
    const trackExpiry = $id('trackExpiry');
    const expiryRequired = $id('expiryRequired');
    const expiryAlertDays = $id('expiryAlertDays');
    const trackingEnabled = trackExpiry?.checked === true;

    if (expiryRequired) {
      if (!trackingEnabled) expiryRequired.checked = false;
      expiryRequired.disabled = !trackingEnabled;
    }
    if (expiryAlertDays) expiryAlertDays.disabled = !trackingEnabled;
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
      set('productVariantCatalogPreview', product.variantId);
      set('purchasePrice', product.purchasePrice);
      set('salePrice', product.salePrice);
      set('wholesalePrice', product.wholesalePrice);
      set('minStockLevel', product.minStockLevel);
      set('currentStock', product.currentStock);
      const allowOverrideEl = $id('allowSalePriceOverride');
      if (allowOverrideEl) allowOverrideEl.checked = product.allowSalePriceOverride === true;
      const allowPriceChangeEl = $id('allowPriceChange');
      if (allowPriceChangeEl) allowPriceChangeEl.checked = product.allowPriceChange === true;
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
        'allowPriceChange',
        'autoUpdateSalePriceFromPurchase',
        'trackExpiry',
        'expiryRequired',
      ].forEach((id) => {
        const el = $id(id);
        if (el) el.checked = false;
      });
      set('expiryAlertDays', '');
    }

    const barcodeButton = $id('barcodePrintButton');
    if (barcodeButton) {
      const hasSavedProduct = Number($id('productId')?.value) > 0;
      barcodeButton.disabled = !hasSavedProduct;
      barcodeButton.title = hasSavedProduct
        ? 'Open Barcode Designer for this saved product'
        : 'Save the product before printing a barcode';
    }

    syncExpiryPolicyState();

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
    closeCatalogDialog();
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
      variantId: Number($id('productVariantCatalogPreview')?.value) || null,
      purchasePrice: parseFloat($id('purchasePrice')?.value || '0') || 0,
      salePrice: parseFloat($id('salePrice')?.value || '0') || 0,
      wholesalePrice: parseFloat($id('wholesalePrice')?.value || '0') || 0,
      minStockLevel: parseFloat($id('minStockLevel')?.value || '0') || 0,
      currentStock: parseFloat($id('currentStock')?.value || '0') || 0,
      allowSalePriceOverride: $id('allowSalePriceOverride')?.checked === true,
      allowPriceChange: $id('allowPriceChange')?.checked === true,
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
    const seq = ++_productRefreshSeq;
    const res = await A().loadProducts(filters || getCurrentFilters());
    if (seq !== _productRefreshSeq) return res;
    if (!res?.ok) {
      showMsg(res?.message || 'Unable to load products. Please try again.', true);
      return res;
    }
    setCanWrite(res.permissions?.canWrite ?? false);
    renderProductTable(res.products || []);
    return res;
  }

  async function refreshProductLiveState(options = {}) {
    const opts =
      options && typeof options === 'object' && !Array.isArray(options)
        ? options
        : { filters: options };
    const includeCatalog = Boolean(opts.includeCatalog);
    const includeStats = opts.includeStats !== false;
    const catalogRes = includeCatalog
      ? await refreshCatalog(opts.showCatalogError !== false)
      : null;
    const selectedFilters = opts.filters || getCurrentFilters();
    const [productsRes, statsRes] = await Promise.all([
      refreshProducts(selectedFilters),
      includeStats ? refreshStats() : Promise.resolve(null),
    ]);
    return { catalog: catalogRes, products: productsRes, stats: statsRes };
  }

  async function refreshStats() {
    const res = await A().loadStats();
    if (res?.ok) renderStats(res.count || {});
    return res;
  }

  async function refreshCatalog(showError) {
    const res = await A().loadCatalog();
    if (!res?.ok) {
      if (showError) showMsg(res?.message || 'Unable to load product catalogs.', true);
      return res;
    }
    renderCatalogDropdowns(res.catalog);
    renderCatalogLists(res.catalog);
    return res;
  }

  async function refreshCatalogType(type, selectedId) {
    const res = await A().loadCatalogType(type);
    if (!res?.ok) {
      showMsg(res?.message || `Unable to load ${type}.`, true);
      return res;
    }
    renderCatalogType(type, res.items || [], selectedId);
    return res;
  }

  function closeCatalogDialog() {
    const panel = $id('catalogPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.querySelector(UI.selectors.catalogForm)?.reset();
    _activeCatalogType = null;
  }

  function showCatalogMessage(text, isError) {
    const message = $id('pfCatalogMessage');
    if (!message) return;
    message.textContent = text || '';
    message.classList.toggle('error', Boolean(isError));
    message.classList.toggle('hidden', !text);
  }

  async function openCatalogDialog(type) {
    const config = CATALOG_CONFIG[type];
    const panel = $id('catalogPanel');
    const form = panel?.querySelector(UI.selectors.catalogForm);
    if (!config || !panel || !form) return;
    if (config.supported === false) {
      showMsg(`${config.label} catalog is not available yet.`, true);
      return;
    }

    _activeCatalogType = type;
    form.reset();
    form.dataset.type = type;
    const title = $id('pfCatalogTitle');
    const name = $id('pfCatalogName');
    const submit = $id('pfCatalogSubmit');
    const descriptionField = $id('pfCatalogDescriptionField');
    const shortNameField = $id('pfCatalogShortNameField');
    const shortName = $id('pfCatalogShortName');
    if (title) title.textContent = `Add ${config.label}`;
    if (name) name.placeholder = `${config.label} name`;
    if (submit) submit.textContent = `Add ${config.label}`;
    descriptionField?.classList.toggle('hidden', Boolean(config.usesShortName));
    shortNameField?.classList.toggle('hidden', !config.usesShortName);
    if (shortName) shortName.required = Boolean(config.usesShortName);

    showCatalogMessage('');
    panel.classList.remove('hidden');
    await refreshCatalogType(type);
    name?.focus();
  }

  async function saveProductFromForm(e) {
    e.preventDefault();
    if (_productSaveInFlight) return;
    const productId = $id('productId')?.value;
    const saveBtn = $id('saveProductButton');
    _productSaveInFlight = true;
    if (saveBtn) saveBtn.disabled = true;
    try {
      const res = await A().saveProduct(productId, buildProductPayload());
      if (!res?.ok) {
        showFormMsg(res?.message || 'Unable to save product. Please try again.', true);
        return;
      }
      showMsg(res.message || 'Product saved.');
      closeProductForm();
      await refreshProductLiveState({ filters: getCurrentFilters() });
    } finally {
      _productSaveInFlight = false;
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
    await refreshProductLiveState({ filters: getCurrentFilters() });
  }

  async function printBarcodeFromForm() {
    const productId = Number($id('productId')?.value);
    if (!Number.isInteger(productId) || productId <= 0) {
      showMsg('Save the product before printing a barcode.', true);
      return;
    }
    const res = await A().printBarcode({ productId, copies: 1 });
    showMsg(res?.message || 'Unable to print barcode.', !res?.ok);
  }

  async function printBarcodeFromTable(productId) {
    const res = await A().printBarcode({ productId: Number(productId), copies: 1 });
    showMsg(res?.message || 'Unable to print barcode.', !res?.ok);
  }

  async function saveCatalogItemFromForm(e) {
    e.preventDefault();
    if (_catalogSaveInFlight) return;
    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]');
    _catalogSaveInFlight = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const type = form.dataset.type;
      const config = CATALOG_CONFIG[type];
      if (!config || config.supported === false) {
        showCatalogMessage('This catalog type is not available yet.', true);
        return;
      }
      const payload = buildCatalogPayload(form);
      if (!payload.name) {
        showCatalogMessage(`${config.label} name is required.`, true);
        return;
      }
      if (config.usesShortName && !payload.shortName) {
        showCatalogMessage('Unit short name is required.', true);
        return;
      }
      const res = await A().saveCatalogItem(type, payload);
      if (!res?.ok) {
        showCatalogMessage(res?.message || `Unable to save ${type}. Please try again.`, true);
        return;
      }
      showCatalogMessage(res.message || `${type} saved.`);
      form.reset();
      const selectedId = res.item?.id;
      const refreshRes = await refreshCatalogType(type, selectedId);
      if (!refreshRes?.ok) {
        showCatalogMessage(refreshRes?.message || `Unable to refresh ${type}.`, true);
        return;
      }
      closeCatalogDialog();
    } finally {
      _catalogSaveInFlight = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function deleteCatalogItemFromList(type, id, name) {
    const confirmed = await window.posApi.dialog.confirm(`Delete "${name}"?`);
    window.focus?.();
    if (!confirmed) return;
    const res = await A().deleteCatalogItem(type, id);
    if (!res?.ok) {
      showCatalogMessage(res?.message || `Unable to delete ${type}. Please try again.`, true);
      return;
    }
    showCatalogMessage(res.message || `${type} deleted.`);
    await refreshCatalogType(type);
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

      const barcodeBtn = e.target.closest(UI.selectors.printBarcodeProduct);
      if (barcodeBtn) {
        printBarcodeFromTable(Number(barcodeBtn.dataset.printBarcodeProduct));
        return;
      }

      const delBtn = e.target.closest(UI.selectors.deleteProduct);
      if (delBtn)
        deleteProductFromTable(Number(delBtn.dataset.deleteProduct), delBtn.dataset.productName);
    });

    // ── Product form save (inside shell modal) ────────────────────────────────
    $id('form')?.addEventListener('submit', saveProductFromForm);
    $id('trackExpiry')?.addEventListener('change', syncExpiryPolicyState);

    // ── Close product form ────────────────────────────────────────────────────
    $id('closeFormButton')?.addEventListener('click', () => closeProductForm());

    // ── Barcode print button ──────────────────────────────────────────────────
    $id('barcodePrintButton')?.addEventListener('click', printBarcodeFromForm);

    document.querySelectorAll('[data-catalog-open]').forEach((button) =>
      button.addEventListener('click', () => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;
        if (!requireFeature('products.catalog_management')) return;
        openCatalogDialog(button.dataset.catalogOpen);
      })
    );

    document
      .querySelectorAll(UI.selectors.catalogClose)
      .forEach((button) => button.addEventListener('click', closeCatalogDialog));

    // ── Catalog form — add item ───────────────────────────────────────────────
    document
      .querySelectorAll(UI.selectors.catalogForm)
      .forEach((form) => form.addEventListener('submit', saveCatalogItemFromForm));

    // ── Active catalog list — delete item (event delegation) ─────────────────
    $id('catalogList')?.addEventListener('click', (e) => {
      const btn = e.target.closest(UI.selectors.catalogDelete);
      if (!btn) return;
      deleteCatalogItemFromList(
        btn.dataset.catalogDelete,
        Number(btn.dataset.catalogId),
        btn.dataset.catalogName
      );
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$id('catalogPanel')?.classList.contains('hidden')) {
        closeCatalogDialog();
      }
    });

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

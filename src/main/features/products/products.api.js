/**
 * products.api.js — Products API Call Handler
 *
 * File:      src/main/features/products/products.api.js
 * Reason:    Centralised posApi call layer for Products module (Phase 4)
 * Risk:      LOW — calls existing IPC channels only, no new channels
 * Rollback:  Delete file; remove script tag from renderer/index.html
 *
 * RESPONSIBILITY: All window.posApi.products.* and window.posApi.catalog.* calls.
 *   Reads filter/display state via ProductsRenderer state accessors.
 *   Triggers UI updates by calling window.ProductsRenderer render functions.
 * Exposes: window.ProductsApi
 *
 * Load order: must load AFTER products.renderer.js defines window.ProductsRenderer
 *   Actually: products.api.js loads first, but only calls ProductsRenderer at runtime.
 * Depends on: window.posApi (preload), window.ProductsRenderer (runtime)
 *
 * NOT ALLOWED in this file:
 *   - Business rule validation (belongs in product.service.js)
 *   - DOM state management (belongs in products.renderer.js)
 *   - Cross-module calls
 */
(function ProductsApiModule() {
  'use strict';

  /** Shorthand — all render/display operations go through ProductsRenderer */
  const R = () => window.ProductsRenderer;

  function $id(id) { return document.getElementById(id); }

  // ── Internal helpers (matches billing.api.js pattern exactly) ─────────────

  /** Lightweight, removable logger — non-intrusive, no side effects */
  const LOG = (...args) => console.log('[ProductsApi]', ...args);

  /**
   * Normalizes a posApi response into { ok, message }.
   * Handles res.ok / res.success variation across IPC channels.
   * Single point where response shape assumptions are documented.
   *
   * @param  {object|null} res       Raw IPC response
   * @param  {string}      fallback  User-facing error message if res provides none
   * @returns {{ ok: boolean, message: string }}
   */
  function apiOk(res, fallback) {
    const ok = Boolean(res?.ok || res?.success);
    const message = res?.message || res?.failureReason || fallback || 'Request failed.';
    return { ok, message };
  }

  // ── Product list + stats ──────────────────────────────────────────────────

  async function loadProducts(filters) {
    try {
      LOG('loadProducts()', filters);
      const res = await window.posApi.products.list(filters || {});
      const { ok, message } = apiOk(res, 'Failed to load products.');
      if (!ok) { R().showMsg(message, true); return; }
      R().setCanWrite(res.permissions?.canWrite ?? false);
      R().renderProductTable(res.products || []);
      LOG('loadProducts() — received', (res.products || []).length, 'products');
    } catch (err) {
      LOG('loadProducts error:', err);
      R().showMsg('Failed to load products. Please try again.', true);
    }
  }

  async function loadStats() {
    try {
      LOG('loadStats()');
      const res = await window.posApi.products.stats();
      const { ok } = apiOk(res, 'Failed to load product stats.');
      if (!ok) return; // stats are non-critical — page still usable
      R().renderStats(res.count || {});
    } catch (err) {
      LOG('loadStats error:', err); // non-critical — no user msg needed
    }
  }

  // ── Product CRUD ──────────────────────────────────────────────────────────

  async function saveProduct(e) {
    e.preventDefault();
    const productId = $id('productId')?.value;
    const isEdit    = Boolean(productId);

    const payload = {
      name:          ($id('productName')?.value      || '').trim(),
      sku:           ($id('productSku')?.value       || '').trim() || undefined,
      barcode:       ($id('productBarcode')?.value   || '').trim() || undefined,
      categoryId:    Number($id('productCategory')?.value) || null,
      brandId:       Number($id('productBrand')?.value)    || null,
      unitId:        Number($id('productUnit')?.value)     || null,
      purchasePrice: parseFloat($id('purchasePrice')?.value  || '0') || 0,
      salePrice:     parseFloat($id('salePrice')?.value      || '0') || 0,
      wholesalePrice:parseFloat($id('wholesalePrice')?.value || '0') || 0,
      minStockLevel: parseFloat($id('minStockLevel')?.value  || '0') || 0,
      currentStock:  parseFloat($id('currentStock')?.value   || '0') || 0,
      isActive:      $id('productActive')?.checked ?? true
    };

    // No renderer-side validation — product.service.js enforces all rules

    const saveBtn = $id('saveProductButton');
    if (saveBtn) saveBtn.disabled = true;

    try {
      LOG(isEdit ? 'updateProduct()' : 'createProduct()', payload.name);
      const res = isEdit
        ? await window.posApi.products.update(Number(productId), payload)
        : await window.posApi.products.create(payload);

      const { ok, message } = apiOk(res, isEdit ? 'Update failed.' : 'Create failed.');
      if (!ok) { R().showFormMsg(message, true); return; }

      LOG(isEdit ? 'Product updated:' : 'Product created:', res.product?.name);
      R().showMsg(message || (isEdit ? 'Product updated.' : 'Product saved.'));
      R().closeProductForm();
      // Reload list + stats to reflect changes
      await loadProducts(R().getCurrentFilters());
      await loadStats();
    } catch (err) {
      LOG('saveProduct error:', err);
      R().showFormMsg('Request failed. Please try again.', true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function deleteProduct(productId, productName) {
    let confirmed = false;
    try {
      confirmed = await window.posApi.dialog.confirm(
        `Delete "${productName}"? This action cannot be undone.`);
    } catch (_) { confirmed = window.confirm(`Delete "${productName}"?`); }
    if (!confirmed) return;

    try {
      LOG('deleteProduct():', productId);
      const res = await window.posApi.products.delete(productId);
      const { ok, message } = apiOk(res, 'Delete failed.');
      if (!ok) { R().showMsg(message, true); return; }
      R().showMsg(message || 'Product deleted.');
      await loadProducts(R().getCurrentFilters());
      await loadStats();
    } catch (err) {
      LOG('deleteProduct error:', err);
      R().showMsg('Delete request failed. Please try again.', true);
    }
  }

  async function loadProductForEdit(productId) {
    try {
      LOG('loadProductForEdit():', productId);
      // List with exact ID filter — service returns the single product
      const res = await window.posApi.products.list({ id: productId });
      const { ok, message } = apiOk(res, 'Could not load product.');
      if (!ok || !res.products?.length) {
        R().showMsg(message || 'Product not found.', true);
        return;
      }
      await loadCatalog(); // ensure dropdowns are populated before opening form
      R().openProductForm(res.products[0]);
    } catch (err) {
      LOG('loadProductForEdit error:', err);
      R().showMsg('Could not load product for editing.', true);
    }
  }

  // ── Barcode print ─────────────────────────────────────────────────────────

  async function printBarcode() {
    const productId = $id('productId')?.value;
    if (!productId) { R().showMsg('Save the product first to print a barcode.', true); return; }
    try {
      LOG('printBarcode():', productId);
      const res = await window.posApi.printing?.printBarcode?.({ productId: Number(productId) });
      const { ok, message } = apiOk(res, 'Barcode print failed.');
      if (ok) R().showMsg('Barcode sent to printer.');
      else    R().showMsg(message, true);
    } catch (err) {
      LOG('printBarcode error:', err);
      R().showMsg('Barcode print failed. Check printer settings.', true);
    }
  }

  // ── Catalog (categories / brands / units) ─────────────────────────────────

  async function loadCatalog() {
    try {
      LOG('loadCatalog() — fetching all 3 types');
      const [cats, brands, units] = await Promise.all([
        window.posApi.catalog.list('categories'),
        window.posApi.catalog.list('brands'),
        window.posApi.catalog.list('units')
      ]);
      const catalog = {
        categories: cats?.items  || [],
        brands:     brands?.items || [],
        units:      units?.items  || []
      };
      R().renderCatalogDropdowns(catalog);
      R().renderCatalogLists(catalog);
      LOG('loadCatalog() — done');
    } catch (err) {
      LOG('loadCatalog error:', err);
      R().showMsg('Could not load categories/brands/units.', true);
    }
  }

  async function saveCatalogItem(e) {
    e.preventDefault();
    const form   = e.target;
    const type   = form.dataset.type;
    const nameEl = form.querySelector('input[name="name"]');
    const descEl = form.querySelector('input[name="description"]');
    const shortEl= form.querySelector('input[name="shortName"]');
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      name:        (nameEl?.value  || '').trim(),
      description: (descEl?.value  || '').trim() || undefined,
      shortName:   (shortEl?.value || '').trim() || undefined
    };

    try {
      LOG('saveCatalogItem():', type, payload.name);
      const res = await window.posApi.catalog.create(type, payload);
      const { ok, message } = apiOk(res, `Failed to save ${type}.`);
      if (!ok) { R().showMsg(message, true); return; }
      R().showMsg(message || `${type} saved.`);
      form.reset();
      await loadCatalog(); // refresh all catalog dropdowns + lists
    } catch (err) {
      LOG('saveCatalogItem error:', err);
      R().showMsg(`Could not save ${type}. Please try again.`, true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function deleteCatalogItem(type, id, name) {
    let confirmed = false;
    try {
      confirmed = await window.posApi.dialog.confirm(`Delete "${name}"?`);
    } catch (_) { confirmed = window.confirm(`Delete "${name}"?`); }
    if (!confirmed) return;

    try {
      LOG('deleteCatalogItem():', type, id);
      const res = await window.posApi.catalog.delete(type, id);
      const { ok, message } = apiOk(res, 'Delete failed.');
      if (!ok) { R().showMsg(message, true); return; }
      R().showMsg(message || 'Item deleted.');
      await loadCatalog();
    } catch (err) {
      LOG('deleteCatalogItem error:', err);
      R().showMsg('Delete failed. Please try again.', true);
    }
  }

  // ── Excel import / export (shell integration) ─────────────────────────────

  async function handleToolAction(action) {
    try {
      if (action === 'import') {
        LOG('tool: import products');
        const res = await window.posApi.dataTools?.importProducts?.();
        const { ok, message } = apiOk(res, 'Import failed.');
        if (ok) { R().showMsg(message || 'Import complete.'); await loadProducts(R().getCurrentFilters()); await loadStats(); }
        else     R().showMsg(message, true);
      } else if (action === 'excel') {
        LOG('tool: export products');
        const res = await window.posApi.dataTools?.exportProducts?.();
        const { ok, message } = apiOk(res, 'Export failed.');
        if (res?.canceled) return;
        if (ok) R().showMsg(message || 'Export complete.');
        else    R().showMsg(message, true);
      }
    } catch (err) {
      LOG('handleToolAction error:', action, err);
      R().showMsg(`${action === 'import' ? 'Import' : 'Export'} failed. Please try again.`, true);
    }
  }

  // ── Public surface ────────────────────────────────────────────────────────

  window.ProductsApi = {
    loadProducts, loadStats,
    saveProduct, deleteProduct, loadProductForEdit,
    printBarcode,
    loadCatalog, saveCatalogItem, deleteCatalogItem,
    handleToolAction
  };
})();

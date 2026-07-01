/**
 * products.api.js - Products API Call Handler
 *
 * RESPONSIBILITY: window.posApi calls for Products only.
 * Returns structured data only. Renderer owns DOM, events, and UI state.
 */
(function ProductsApiModule() {
  'use strict';

  const LOG = () => {};

  function apiOk(res, fallback) {
    const ok = Boolean(res?.ok || res?.success);
    const message =
      res?.message || res?.failureReason || fallback || 'Something went wrong. Please try again.';
    return { ok, message };
  }

  function featureCheck(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  async function loadProducts(filters) {
    try {
      LOG('loadProducts()', filters);
      const res = await window.posApi.products.list(filters || {});
      const { ok, message } = apiOk(res, 'Unable to load products. Please try again.');
      if (!ok) return { ok: false, message, products: [], permissions: res?.permissions || {} };
      return {
        ok: true,
        message,
        products: res.products || [],
        permissions: res.permissions || {},
      };
    } catch {
      return { ok: false, message: 'Unable to load products. Please try again.', products: [] };
    }
  }

  async function loadStats() {
    try {
      const res = await window.posApi.products.stats();
      const { ok, message } = apiOk(res, 'Unable to load product stats.');
      return { ok, message, count: ok ? res.count || {} : {} };
    } catch {
      return { ok: false, message: 'Unable to load product stats.', count: {} };
    }
  }

  async function saveProduct(productId, payload) {
    const isEdit = Boolean(productId);
    try {
      const res = isEdit
        ? await window.posApi.products.update(Number(productId), payload)
        : await window.posApi.products.create(payload);
      const { ok, message } = apiOk(
        res,
        isEdit
          ? 'Unable to update product. Please try again.'
          : 'Unable to create product. Please try again.'
      );
      return {
        ok,
        message: ok ? message || (isEdit ? 'Product updated.' : 'Product saved.') : message,
        product: res?.product,
      };
    } catch {
      return {
        ok: false,
        message: isEdit
          ? 'Unable to update product. Please try again.'
          : 'Unable to create product. Please try again.',
      };
    }
  }

  async function deleteProduct(productId) {
    try {
      const res = await window.posApi.products.delete(productId);
      const { ok, message } = apiOk(res, 'Unable to delete product. Please try again.');
      return { ok, message: ok ? message || 'Product deleted.' : message };
    } catch {
      return { ok: false, message: 'Unable to delete product. Please try again.' };
    }
  }

  async function loadProductForEdit(productId) {
    try {
      const res = await window.posApi.products.list({ id: productId });
      const { ok, message } = apiOk(res, 'Unable to load product. Please try again.');
      if (!ok || !res.products?.length) {
        return { ok: false, message: message || 'Product not found.' };
      }
      return { ok: true, product: res.products[0] };
    } catch {
      return { ok: false, message: 'Unable to load product for editing. Please try again.' };
    }
  }

  async function printBarcode(productId) {
    const gate = featureCheck('products.print_barcode');
    if (!gate.ok) return { ok: false, message: gate.message };
    if (!productId) {
      return { ok: false, message: 'Save the product first to print a barcode.' };
    }
    try {
      const res = await window.posApi.printing?.printBarcode?.({ productId: Number(productId) });
      const { ok, message } = apiOk(res, 'Unable to print barcode.');
      return { ok, message: ok ? 'Barcode sent to printer.' : message };
    } catch {
      return { ok: false, message: 'Unable to print barcode. Check printer settings.' };
    }
  }

  async function loadCatalog() {
    try {
      const [cats, brands, units] = await Promise.all([
        window.posApi.catalog.list('categories'),
        window.posApi.catalog.list('brands'),
        window.posApi.catalog.list('units'),
      ]);
      return {
        ok: true,
        catalog: {
          categories: cats?.items || [],
          brands: brands?.items || [],
          units: units?.items || [],
        },
      };
    } catch {
      return {
        ok: false,
        message: 'Unable to load categories, brands, and units.',
        catalog: { categories: [], brands: [], units: [] },
      };
    }
  }

  async function saveCatalogItem(type, payload) {
    const gate = featureCheck('products.catalog_management');
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      const res = await window.posApi.catalog.create(type, payload);
      const { ok, message } = apiOk(res, `Unable to save ${type}. Please try again.`);
      return { ok, message: ok ? message || `${type} saved.` : message };
    } catch {
      return { ok: false, message: `Unable to save ${type}. Please try again.` };
    }
  }

  async function deleteCatalogItem(type, id) {
    const gate = featureCheck('products.catalog_management');
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      const res = await window.posApi.catalog.delete(type, id);
      const { ok, message } = apiOk(res, `Unable to delete ${type}. Please try again.`);
      return { ok, message: ok ? message || `${type} deleted.` : message };
    } catch {
      return { ok: false, message: `Unable to delete ${type}. Please try again.` };
    }
  }

  function getToolActionMessage(action) {
    if (action === 'import') {
      const gate = featureCheck('products.import_products_placeholder');
      return { ok: false, message: gate.message };
    }
    if (action === 'excel') {
      const gate = featureCheck('products.export_products_placeholder');
      return { ok: false, message: gate.message };
    }
    return { ok: false, message: 'This product action is planned for a future phase.' };
  }

  window.ProductsApi = {
    loadProducts,
    loadStats,
    saveProduct,
    deleteProduct,
    loadProductForEdit,
    printBarcode,
    loadCatalog,
    saveCatalogItem,
    deleteCatalogItem,
    getToolActionMessage,
  };
})();

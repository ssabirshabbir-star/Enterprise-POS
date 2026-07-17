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

  const SUPPORTED_CATALOG_TYPES = Object.freeze(['categories', 'brands', 'units', 'variants']);

  function isSupportedCatalogType(type) {
    return SUPPORTED_CATALOG_TYPES.includes(String(type || ''));
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

  async function printBarcode(product) {
    const gate = featureCheck('products.print_barcode');
    if (!gate.ok) return { ok: false, message: gate.message };
    const productId = Number(product?.id ?? product?.productId ?? product);
    if (!productId) {
      return { ok: false, message: 'Save the product first to print a barcode.' };
    }
    if (!window.BarcodeDesignerLauncher?.open) {
      return { ok: false, message: 'Barcode designer is unavailable.' };
    }
    const productsResult = await loadProducts({});
    if (!productsResult.ok) return productsResult;
    const products = (productsResult.products || [])
      .filter(
        (item) =>
          Number(item?.id ?? item?.productId) > 0 && item?.barcode && item?.isActive !== false
      )
      .map((item) => {
        const itemId = Number(item.id ?? item.productId);
        return {
          productId: itemId,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          salePrice: item.salePrice,
          currentStock: item.currentStock,
          isActive: item.isActive !== false,
          copies: itemId === productId ? Number(product?.copies) || 1 : 1,
          selected: itemId === productId,
        };
      });
    if (!products.some((item) => item.productId === productId)) {
      return { ok: false, message: 'Selected product is not available for barcode preview.' };
    }
    return window.BarcodeDesignerLauncher.open({
      mode: 'products',
      products,
    });
  }

  async function loadCatalog() {
    try {
      const [cats, brands, units, variants] = await Promise.all([
        window.posApi.catalog.list('categories'),
        window.posApi.catalog.list('brands'),
        window.posApi.catalog.list('units'),
        window.posApi.catalog.list('variants'),
      ]);
      return {
        ok: true,
        catalog: {
          categories: cats?.items || [],
          brands: brands?.items || [],
          units: units?.items || [],
          variants: variants?.items || [],
        },
      };
    } catch {
      return {
        ok: false,
        message: 'Unable to load product catalog values.',
        catalog: { categories: [], brands: [], units: [], variants: [] },
      };
    }
  }

  async function loadCatalogType(type) {
    if (!isSupportedCatalogType(type)) {
      return { ok: false, message: 'This catalog type is not available yet.', items: [] };
    }
    try {
      const res = await window.posApi.catalog.list(type);
      const { ok, message } = apiOk(res, `Unable to load ${type}.`);
      return { ok, message, items: ok ? res?.items || [] : [] };
    } catch {
      return { ok: false, message: `Unable to load ${type}.`, items: [] };
    }
  }

  async function saveCatalogItem(type, payload) {
    if (!isSupportedCatalogType(type)) {
      return { ok: false, message: 'This catalog type is not available yet.' };
    }
    const gate = featureCheck('products.catalog_management');
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      const res = await window.posApi.catalog.create(type, payload);
      const { ok, message } = apiOk(res, `Unable to save ${type}. Please try again.`);
      const item = res?.item && Number(res.item.id) > 0 ? res.item : null;
      if (ok && !item)
        return { ok: false, message: 'Catalog item was not returned by the backend.' };
      return { ok, message: ok ? message || `${type} saved.` : message, item };
    } catch {
      return { ok: false, message: `Unable to save ${type}. Please try again.` };
    }
  }

  async function deleteCatalogItem(type, id) {
    if (!isSupportedCatalogType(type)) {
      return { ok: false, message: 'This catalog type is not available yet.' };
    }
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
    loadCatalogType,
    saveCatalogItem,
    deleteCatalogItem,
    getToolActionMessage,
  };
})();

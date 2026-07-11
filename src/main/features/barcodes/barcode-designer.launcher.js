(function BarcodeDesignerLauncherModule() {
  'use strict';

  const LAUNCH_KEY = 'enterprise-pos.barcode-label-designer.launch.v1';
  const DESIGNER_PATH = '../main/features/barcodes/barcode-designer.html';

  function clampCopies(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.max(1, Math.min(100, Math.trunc(number)));
  }

  function plainProduct(product) {
    const id = Number(product?.productId ?? product?.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      productId: id,
      name: String(product.name || product.productName || `Product ${id}`).trim(),
      sku: String(product.sku || product.code || '').trim(),
      barcode: String(product.barcode || '').trim(),
      salePrice: Number(product.salePrice ?? product.price ?? 0) || 0,
      stock: Number(product.currentStock ?? product.stock ?? 0) || 0,
      copies: clampCopies(product.copies ?? 1),
      selected: product.selected !== false,
    };
  }

  function normalizeLaunch(input = {}) {
    const mode = input.mode === 'inventory' ? 'inventory' : 'products';
    const products = (Array.isArray(input.products) ? input.products : [])
      .map(plainProduct)
      .filter(Boolean);
    return Object.freeze({
      schemaVersion: 1,
      mode,
      createdAt: new Date().toISOString(),
      products: Object.freeze(products),
    });
  }

  function open(input = {}) {
    const payload = normalizeLaunch(input);
    if (!payload.products.length) {
      return { ok: false, message: 'Select at least one saved product for barcode preview.' };
    }
    window.localStorage.setItem(LAUNCH_KEY, JSON.stringify(payload));
    const previewWindow = window.open(
      DESIGNER_PATH,
      'BarcodeLabelPreview',
      'width=1180,height=760'
    );
    if (!previewWindow) {
      return { ok: false, message: 'Barcode Label Preview window could not be opened.' };
    }
    return {
      ok: true,
      message: 'Barcode label preview opened. Use Print Barcodes from the preview window.',
    };
  }

  window.BarcodeDesignerLauncher = Object.freeze({
    LAUNCH_KEY,
    normalizeLaunch,
    open,
  });
})();

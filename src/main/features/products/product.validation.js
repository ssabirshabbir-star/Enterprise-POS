function cleanString(value) {
  return String(value || '').trim();
}

function parseMoney(value, field) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    return { ok: false, message: `${field} must be a positive number.` };
  }
  return { ok: true, value: number.toFixed(2) };
}

function parseQuantity(value, field) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    return { ok: false, message: `${field} must be zero or greater.` };
  }
  return { ok: true, value: number.toFixed(3) };
}

function parseNullableId(value, field) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return { ok: false, message: `${field} is invalid.` };
  }
  return { ok: true, value: number };
}

function validateProductPayload(payload) {
  const name = cleanString(payload.name);
  const sku = cleanString(payload.sku).toUpperCase();
  const barcode = cleanString(payload.barcode);

  if (name.length < 2 || name.length > 220) {
    return { ok: false, message: 'Product name must be between 2 and 220 characters.' };
  }

  if (sku && !/^[A-Z0-9._-]{2,80}$/.test(sku)) {
    return { ok: false, message: 'SKU may contain letters, numbers, dot, dash, and underscore only.' };
  }

  if (barcode && !/^[A-Za-z0-9._-]{4,120}$/.test(barcode)) {
    return { ok: false, message: 'Barcode may contain letters, numbers, dot, dash, and underscore only.' };
  }

  const categoryId = parseNullableId(payload.categoryId, 'Category');
  const brandId = parseNullableId(payload.brandId, 'Brand');
  const unitId = parseNullableId(payload.unitId, 'Unit');
  const purchasePrice = parseMoney(payload.purchasePrice, 'Purchase price');
  const salePrice = parseMoney(payload.salePrice, 'Sale price');
  const wholesalePrice = parseMoney(payload.wholesalePrice, 'Wholesale price');
  const minStockLevel = parseQuantity(payload.minStockLevel, 'Minimum stock level');
  const currentStock = parseQuantity(payload.currentStock, 'Current stock');

  const checks = [categoryId, brandId, unitId, purchasePrice, salePrice, wholesalePrice, minStockLevel, currentStock];
  const failed = checks.find((check) => !check.ok);
  if (failed) {
    return failed;
  }

  if (Number(salePrice.value) < Number(purchasePrice.value)) {
    return { ok: false, message: 'Sale price cannot be lower than purchase price.' };
  }

  return {
    ok: true,
    value: {
      name,
      sku,
      barcode,
      categoryId: categoryId.value,
      brandId: brandId.value,
      unitId: unitId.value,
      purchasePrice: purchasePrice.value,
      salePrice: salePrice.value,
      wholesalePrice: wholesalePrice.value,
      minStockLevel: minStockLevel.value,
      currentStock: currentStock.value,
      isActive: payload.isActive !== false
    }
  };
}

function validateCatalogPayload(payload, type) {
  const name = cleanString(payload.name);
  const description = cleanString(payload.description);
  const shortName = cleanString(payload.shortName);

  if (name.length < 2 || name.length > 140) {
    return { ok: false, message: `${type} name must be between 2 and 140 characters.` };
  }

  if (type === 'Unit' && (shortName.length < 1 || shortName.length > 30)) {
    return { ok: false, message: 'Unit short name is required.' };
  }

  return {
    ok: true,
    value: {
      name,
      description,
      shortName,
      isActive: payload.isActive !== false
    }
  };
}

module.exports = {
  validateCatalogPayload,
  validateProductPayload
};

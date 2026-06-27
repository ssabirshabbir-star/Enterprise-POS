const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const catalogRepository = require('../catalog/catalog.repository');
const productRepository = require('./product.repository');
const { canReadProducts, canWriteProducts } = require('./product.permissions');
const { validateCatalogPayload, validateProductPayload } = require('./product.validation');

async function requireProductAccess(mode) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) {
    return { ok: false, status: 'unauthenticated', message: 'Authentication required.' };
  }

  const profile = profileResult.profile;
  const allowed = mode === 'write' ? canWriteProducts(profile.role) : canReadProducts(profile.role);
  if (!allowed) {
    return {
      ok: false,
      status: 'forbidden',
      message: 'You do not have permission for this product action.',
    };
  }

  return { ok: true, profile };
}

function parseId(id) {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return null;
  }
  return productId;
}

function generateSku(name) {
  const prefix = String(name || 'PRODUCT')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6)
    .padEnd(3, 'P');
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function generateBarcode() {
  return `88${Date.now()}${Math.floor(100 + Math.random() * 900)}`.slice(0, 18);
}

async function buildUniqueCodes(payload, exceptId = null) {
  let sku = payload.sku || generateSku(payload.name);
  let barcode = payload.barcode || generateBarcode();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const duplicate = await productRepository.skuOrBarcodeExists({ sku, barcode, exceptId });
    if (!duplicate) {
      return { ok: true, sku, barcode };
    }

    if (duplicate.sku?.toLowerCase() === sku.toLowerCase() && payload.sku) {
      return { ok: false, message: 'SKU already exists.' };
    }

    if (duplicate.barcode?.toLowerCase() === barcode.toLowerCase() && payload.barcode) {
      return { ok: false, message: 'Barcode already exists.' };
    }

    if (!payload.sku) {
      sku = generateSku(payload.name);
    }
    if (!payload.barcode) {
      barcode = generateBarcode();
    }
  }

  return { ok: false, message: 'Could not generate unique product codes. Please try again.' };
}

async function listProducts(filters = {}) {
  const access = await requireProductAccess('read');
  if (!access.ok) {
    return access;
  }

  const id = parseId(filters.id);
  const search = String(filters.search || '').trim();
  const category = parseId(filters.category);
  const brand = parseId(filters.brand);
  const unit = parseId(filters.unit);
  const stockStatus = String(filters.stockStatus || '').trim();
  const tab = String(filters.tab || '').trim();
  const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 200);
  const offset = Math.max(Number(filters.offset || 0), 0);
  const products = await productRepository.listProducts({
    id,
    search,
    category,
    brand,
    unit,
    stockStatus,
    tab,
    limit,
    offset,
  });
  return { ok: true, products, permissions: { canWrite: canWriteProducts(access.profile.role) } };
}

async function getProductStats() {
  const access = await requireProductAccess('read');
  if (!access.ok) {
    return access;
  }

  return { ok: true, count: await productRepository.countProducts() };
}

async function lookupBarcode(barcode) {
  const access = await requireProductAccess('read');
  if (!access.ok) {
    return access;
  }

  const cleanBarcode = String(barcode || '').trim();
  if (!cleanBarcode) {
    return { ok: false, message: 'Barcode is required.' };
  }

  const product = await productRepository.findProductByBarcode(cleanBarcode);
  if (!product) {
    return { ok: false, message: 'Product not found.' };
  }

  return { ok: true, product };
}

async function createProduct(payload) {
  const access = await requireProductAccess('write');
  if (!access.ok) {
    return access;
  }

  const validation = validateProductPayload(payload || {});
  if (!validation.ok) {
    return validation;
  }

  const codes = await buildUniqueCodes(validation.value);
  if (!codes.ok) {
    return codes;
  }

  const productPayload = { ...validation.value, sku: codes.sku, barcode: codes.barcode };
  const productId = await productRepository.createProduct(productPayload, access.profile.id);
  const product = await productRepository.findProductById(productId);

  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'product.create',
    status: 'success',
    message: 'Product created',
    metadata: { productId, sku: product.sku, barcode: product.barcode },
  });

  return { ok: true, product, message: 'Product saved successfully.' };
}

async function updateProduct(productId, payload) {
  const access = await requireProductAccess('write');
  if (!access.ok) {
    return access;
  }

  const id = parseId(productId);
  if (!id) {
    return { ok: false, message: 'Invalid product id.' };
  }

  const existing = await productRepository.findProductById(id);
  if (!existing) {
    return { ok: false, message: 'Product not found.' };
  }

  const validation = validateProductPayload(payload || {});
  if (!validation.ok) {
    return validation;
  }

  const codes = await buildUniqueCodes(validation.value, id);
  if (!codes.ok) {
    return codes;
  }

  const updated = await productRepository.updateProduct(
    id,
    { ...validation.value, sku: codes.sku, barcode: codes.barcode },
    access.profile.id
  );
  if (!updated) {
    return { ok: false, message: 'Product could not be updated.' };
  }

  const product = await productRepository.findProductById(id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'product.update',
    status: 'success',
    message: 'Product updated',
    metadata: { productId: id, sku: product.sku, barcode: product.barcode },
  });

  return { ok: true, product, message: 'Product updated successfully.' };
}

async function deleteProduct(productId) {
  const access = await requireProductAccess('write');
  if (!access.ok) {
    return access;
  }

  const id = parseId(productId);
  if (!id) {
    return { ok: false, message: 'Invalid product id.' };
  }

  const product = await productRepository.findProductById(id);
  if (!product) {
    return { ok: false, message: 'Product not found.' };
  }

  await productRepository.softDeleteProduct(id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'product.delete',
    status: 'success',
    message: 'Product soft deleted',
    metadata: { productId: id, sku: product.sku, barcode: product.barcode },
  });

  return { ok: true, message: 'Product deleted successfully.' };
}

async function listCatalog(type) {
  const access = await requireProductAccess('read');
  if (!access.ok) {
    return access;
  }

  return { ok: true, items: await catalogRepository.listCatalog(type) };
}

async function createCatalog(type, payload) {
  const access = await requireProductAccess('write');
  if (!access.ok) {
    return access;
  }

  const label = type === 'categories' ? 'Category' : type === 'brands' ? 'Brand' : 'Unit';
  const validation = validateCatalogPayload(payload || {}, label);
  if (!validation.ok) {
    return validation;
  }

  try {
    const item = await catalogRepository.createCatalog(type, validation.value);
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: `${type}.create`,
      status: 'success',
      message: `${label} created`,
      metadata: { id: item.id, name: item.name },
    });
    return { ok: true, item, message: `${label} saved successfully.` };
  } catch (error) {
    if (error.code === '23505') {
      return { ok: false, message: `${label} already exists.` };
    }
    throw error;
  }
}

async function updateCatalog(type, id, payload) {
  const access = await requireProductAccess('write');
  if (!access.ok) {
    return access;
  }

  const catalogId = parseId(id);
  if (!catalogId) {
    return { ok: false, message: 'Invalid catalog id.' };
  }

  const label = type === 'categories' ? 'Category' : type === 'brands' ? 'Brand' : 'Unit';
  const validation = validateCatalogPayload(payload || {}, label);
  if (!validation.ok) {
    return validation;
  }

  try {
    const item = await catalogRepository.updateCatalog(type, catalogId, validation.value);
    if (!item) {
      return { ok: false, message: `${label} not found.` };
    }
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: `${type}.update`,
      status: 'success',
      message: `${label} updated`,
      metadata: { id: item.id, name: item.name },
    });
    return { ok: true, item, message: `${label} updated successfully.` };
  } catch (error) {
    if (error.code === '23505') {
      return { ok: false, message: `${label} already exists.` };
    }
    throw error;
  }
}

async function deleteCatalog(type, id) {
  const access = await requireProductAccess('write');
  if (!access.ok) {
    return access;
  }

  const catalogId = parseId(id);
  if (!catalogId) {
    return { ok: false, message: 'Invalid catalog id.' };
  }

  const deleted = await catalogRepository.softDeleteCatalog(type, catalogId);
  if (!deleted) {
    return { ok: false, message: 'Catalog item not found.' };
  }

  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: `${type}.delete`,
    status: 'success',
    message: 'Catalog item soft deleted',
    metadata: { id: catalogId },
  });

  return { ok: true, message: 'Catalog item deleted successfully.' };
}

module.exports = {
  createCatalog,
  createProduct,
  deleteCatalog,
  deleteProduct,
  listCatalog,
  listProducts,
  getProductStats,
  lookupBarcode,
  updateCatalog,
  updateProduct,
};

const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const inventoryRepository = require('./inventory.repository');
const { canAdjustInventory, canReadInventory } = require('./inventory.permissions');
const fs = require('fs/promises');
const path = require('path');
const { logError } = require('../../utils/safe-logger');
const { serializeInventoryRowsToCsv } = require('./inventory-csv.serializer');

async function requireInventoryAccess(mode) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const allowed =
    mode === 'write' ? canAdjustInventory(profile.role) : canReadInventory(profile.role);
  if (!allowed)
    return { ok: false, message: 'You do not have permission for this inventory action.' };
  return { ok: true, profile };
}

function parseProductId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeProductImage(value) {
  const image = String(value || '').trim();
  if (!image) return { ok: true, image: null };
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) {
    return { ok: false, message: 'Please select a valid PNG, JPG, WEBP, or GIF image.' };
  }
  if (image.length > 2_500_000) {
    return { ok: false, message: 'Product image is too large. Please select an image under 2 MB.' };
  }
  return { ok: true, image };
}

function parseNullableId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeExportFilters(filters = {}) {
  const stockStatusInput = String(filters.stockStatus || '').trim();
  const inventoryTab = String(filters.inventoryTab || '').trim();
  const stockStatus = ['in', 'low', 'out'].includes(stockStatusInput)
    ? stockStatusInput
    : ['low', 'out'].includes(inventoryTab)
      ? inventoryTab
      : '';
  const normalizedInventoryTab =
    stockStatusInput === 'recent'
      ? 'recent'
      : ['all', 'low', 'out', 'recent'].includes(inventoryTab)
        ? inventoryTab
        : 'all';

  return {
    search: String(filters.search || '')
      .trim()
      .slice(0, 120),
    categoryId: parseNullableId(filters.categoryId),
    brandId: parseNullableId(filters.brandId),
    supplierId: parseNullableId(filters.supplierId),
    stockStatus,
    inventoryTab: normalizedInventoryTab,
  };
}

function exportFilterSummary(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== null && value !== '')
  );
}

function safeBasename(filePath) {
  return path.basename(String(filePath || 'inventory-export.csv'));
}

async function writeCsvFile(filePath, csv) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, csv, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function recordExportActivity(entry) {
  try {
    await activityRepository.createActivityLog(entry);
  } catch (error) {
    logError('Inventory CSV export activity log error:', error);
  }
}

async function listInventory(filters = {}) {
  const access = await requireInventoryAccess('read');
  if (!access.ok) return access;
  const items = await inventoryRepository.listInventory({
    search: String(filters.search || '').trim(),
    lowStockOnly: Boolean(filters.lowStockOnly),
    outOfStockOnly: Boolean(filters.outOfStockOnly),
  });
  return { ok: true, items, permissions: { canAdjust: canAdjustInventory(access.profile.role) } };
}

async function exportInventoryCsv({ filePath, filters = {} } = {}) {
  const access = await requireInventoryAccess('read');
  if (!access.ok) {
    return { ok: false, canceled: false, rowCount: 0, message: access.message };
  }

  const selectedPath = String(filePath || '').trim();
  if (!selectedPath) {
    return { ok: false, canceled: false, rowCount: 0, message: 'Export destination is required.' };
  }

  const normalizedFilters = normalizeExportFilters(filters);
  const metadata = {
    fileName: safeBasename(selectedPath),
    filters: exportFilterSummary(normalizedFilters),
  };

  try {
    const rows = await inventoryRepository.listInventoryForExport(normalizedFilters);
    const csv = serializeInventoryRowsToCsv(rows);
    await writeCsvFile(selectedPath, csv);
    await recordExportActivity({
      userId: access.profile.id,
      action: 'inventory.export.csv',
      status: 'success',
      message: 'Inventory CSV exported',
      metadata: { ...metadata, rowCount: rows.length },
    });
    return {
      ok: true,
      canceled: false,
      rowCount: rows.length,
      filePath: selectedPath,
      message: `Exported ${rows.length} inventory item${rows.length === 1 ? '' : 's'} to CSV.`,
    };
  } catch (error) {
    logError('Inventory CSV export failed:', error);
    await recordExportActivity({
      userId: access.profile.id,
      action: 'inventory.export.csv',
      status: 'failed',
      message: 'Inventory CSV export failed',
      metadata: { ...metadata, rowCount: 0, reason: error.code || error.name || 'write_failed' },
    });
    return {
      ok: false,
      canceled: false,
      rowCount: 0,
      message: 'Inventory CSV export failed. Please try again.',
    };
  }
}

async function listMovements(filters = {}) {
  const access = await requireInventoryAccess('read');
  if (!access.ok) return access;
  const productId = filters.productId ? parseProductId(filters.productId) : null;
  const movements = await inventoryRepository.listMovements({ productId, limit: 100 });
  return { ok: true, movements };
}

async function adjustStock(payload = {}) {
  const access = await requireInventoryAccess('write');
  if (!access.ok) return access;
  const productId = parseProductId(payload.productId);
  const movementType = String(payload.movementType || '')
    .trim()
    .toUpperCase();
  const quantity = Number(payload.quantity);
  const reason = String(payload.reason || '').trim();

  if (!productId) return { ok: false, message: 'Product is required.' };
  if (!['IN', 'OUT', 'CORRECTION'].includes(movementType))
    return { ok: false, message: 'Adjustment type is invalid.' };
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    (movementType !== 'CORRECTION' && quantity <= 0)
  ) {
    return { ok: false, message: 'Quantity must be greater than zero.' };
  }
  if (reason.length < 3) return { ok: false, message: 'Reason is required.' };

  const result = await inventoryRepository.adjustStock({
    productId,
    movementType,
    quantity,
    reason,
    userId: access.profile.id,
  });
  if (!result.ok) return result;

  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'inventory.adjust',
    status: 'success',
    message: 'Stock adjusted',
    metadata: {
      productId,
      movementType,
      quantity,
      previousStock: result.previousStock,
      newStock: result.newStock,
    },
  });

  return { ok: true, message: 'Stock adjusted successfully.', ...result };
}

async function updateProductImage(payload = {}) {
  const access = await requireInventoryAccess('write');
  if (!access.ok) return access;

  const productId = parseProductId(payload.productId);
  if (!productId) return { ok: false, message: 'Product is required.' };

  const imageResult = normalizeProductImage(payload.productImage);
  if (!imageResult.ok) return imageResult;

  const updated = await inventoryRepository.updateProductImage({
    productId,
    productImage: imageResult.image,
  });

  if (!updated) return { ok: false, message: 'Product was not found.' };

  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'inventory.product_image.update',
    status: 'success',
    message: 'Product image updated',
    metadata: { productId, hasImage: Boolean(imageResult.image) },
  });

  return {
    ok: true,
    message: imageResult.image ? 'Product image updated.' : 'Product image removed.',
  };
}

module.exports = {
  adjustStock,
  exportInventoryCsv,
  listInventory,
  listMovements,
  updateProductImage,
};

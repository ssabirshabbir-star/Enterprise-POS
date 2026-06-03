const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const inventoryRepository = require('./inventory.repository');
const { canAdjustInventory, canReadInventory } = require('./inventory.permissions');

async function requireInventoryAccess(mode) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const allowed = mode === 'write' ? canAdjustInventory(profile.role) : canReadInventory(profile.role);
  if (!allowed) return { ok: false, message: 'You do not have permission for this inventory action.' };
  return { ok: true, profile };
}

function parseProductId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function listInventory(filters = {}) {
  const access = await requireInventoryAccess('read');
  if (!access.ok) return access;
  const items = await inventoryRepository.listInventory({
    search: String(filters.search || '').trim(),
    lowStockOnly: Boolean(filters.lowStockOnly),
    outOfStockOnly: Boolean(filters.outOfStockOnly)
  });
  return { ok: true, items, permissions: { canAdjust: canAdjustInventory(access.profile.role) } };
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
  const movementType = String(payload.movementType || '').trim().toUpperCase();
  const quantity = Number(payload.quantity);
  const reason = String(payload.reason || '').trim();

  if (!productId) return { ok: false, message: 'Product is required.' };
  if (!['IN', 'OUT', 'CORRECTION'].includes(movementType)) return { ok: false, message: 'Adjustment type is invalid.' };
  if (!Number.isFinite(quantity) || quantity < 0 || (movementType !== 'CORRECTION' && quantity <= 0)) {
    return { ok: false, message: 'Quantity must be greater than zero.' };
  }
  if (reason.length < 3) return { ok: false, message: 'Reason is required.' };

  const result = await inventoryRepository.adjustStock({ productId, movementType, quantity, reason, userId: access.profile.id });
  if (!result.ok) return result;

  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'inventory.adjust',
    status: 'success',
    message: 'Stock adjusted',
    metadata: { productId, movementType, quantity, previousStock: result.previousStock, newStock: result.newStock }
  });

  return { ok: true, message: 'Stock adjusted successfully.', ...result };
}

module.exports = {
  adjustStock,
  listInventory,
  listMovements
};

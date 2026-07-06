const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const purchaseRepository = require('./purchase.repository');
const {
  canCreatePurchases,
  canDeletePurchases,
  canReadPurchases,
  canUpdatePurchases,
} = require('./purchase.permissions');

async function requirePurchaseAccess(mode) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const accessByMode = {
    create: canCreatePurchases,
    delete: canDeletePurchases,
    read: canReadPurchases,
    update: canUpdatePurchases,
  };
  const allowed = (accessByMode[mode] || canReadPurchases)(profile);
  if (!allowed)
    return { ok: false, message: 'You do not have permission for this purchase action.' };
  return { ok: true, profile };
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return null;
  return Number(number.toFixed(2));
}

async function listProducts() {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  return { ok: true, products: await purchaseRepository.listProducts() };
}

async function listPurchases() {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  return {
    ok: true,
    purchases: await purchaseRepository.listPurchases(),
    permissions: {
      canCreate: canCreatePurchases(access.profile),
      canDelete: canDeletePurchases(access.profile),
      canUpdate: canUpdatePurchases(access.profile),
      canWrite:
        canCreatePurchases(access.profile) ||
        canUpdatePurchases(access.profile) ||
        canDeletePurchases(access.profile),
    },
  };
}

async function getPurchaseDetails(purchaseId) {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  const id = Number(purchaseId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid purchase id.' };
  const purchase = await purchaseRepository.getPurchaseDetails(id);
  if (!purchase) return { ok: false, message: 'Purchase not found.' };
  return { ok: true, purchase };
}

async function deletePurchase(purchaseId) {
  const access = await requirePurchaseAccess('delete');
  if (!access.ok) return access;
  const id = Number(purchaseId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid purchase id.' };
  try {
    const deleted = await purchaseRepository.softDeletePurchase(id, access.profile.id);
    if (!deleted) return { ok: false, message: 'Purchase not found.' };
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'purchase.delete',
      status: 'success',
      message: 'Purchase deleted',
      metadata: { purchaseId: id, invoiceNumber: deleted.invoiceNumber },
    });
    return { ok: true, message: 'Purchase deleted and stock reversed successfully.' };
  } catch (error) {
    if (error.code === 'PURCHASE_DELETE_NEGATIVE_STOCK') {
      return {
        ok: false,
        message:
          'This purchase cannot be deleted because reversing it would make product stock negative.',
      };
    }
    if (error.code === 'PURCHASE_DELETE_SUPPLIER_BALANCE_CONFLICT') {
      return {
        ok: false,
        message:
          'This purchase cannot be deleted because supplier payments/balance would become inconsistent.',
      };
    }
    if (error.code === 'PURCHASE_PRODUCT_MISSING') {
      return {
        ok: false,
        message: 'This purchase cannot be deleted because one product no longer exists.',
      };
    }
    throw error;
  }
}

async function createPurchase(payload = {}) {
  const access = await requirePurchaseAccess('create');
  if (!access.ok) return access;
  const supplierId = payload.supplierId ? Number(payload.supplierId) : null;
  const invoiceNumber = String(payload.invoiceNumber || '').trim();
  const purchaseDate = payload.purchaseDate || new Date().toISOString().slice(0, 10);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!invoiceNumber) return { ok: false, message: 'Invoice number is required.' };
  if (items.length === 0) return { ok: false, message: 'At least one purchase item is required.' };

  const cleanItems = [];
  const productPolicies = await purchaseRepository.getProductPolicies(
    items.map((item) => item.productId)
  );

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const purchasePrice = money(item.purchasePrice);
    const salePrice = money(item.salePrice);
    if (!Number.isInteger(productId) || productId <= 0)
      return { ok: false, message: 'Invalid product in purchase item.' };
    if (!Number.isFinite(quantity) || quantity <= 0)
      return { ok: false, message: 'Purchase quantity must be greater than zero.' };
    if (purchasePrice === null || salePrice === null)
      return { ok: false, message: 'Invalid purchase item price.' };
    const productPolicy = productPolicies.get(productId);
    if (!productPolicy) return { ok: false, message: 'Invalid or inactive product in purchase.' };
    const expirationDate = item.expirationDate || null;
    if ((productPolicy.trackExpiry || productPolicy.expiryRequired) && !expirationDate) {
      return { ok: false, message: 'Expiry date is required for one or more products.' };
    }
    cleanItems.push({
      productId,
      quantity,
      purchasePrice,
      salePrice,
      batchNumber: String(item.batchNumber || '').trim() || null,
      expirationDate,
      total: Number((quantity * purchasePrice).toFixed(2)),
    });
  }

  const subtotal = Number(cleanItems.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  const discount = money(payload.discount);
  const tax = money(payload.tax);
  const paidAmount = money(payload.paidAmount);
  if (discount === null || tax === null || paidAmount === null)
    return { ok: false, message: 'Invalid purchase totals.' };
  const grandTotal = Number((subtotal - discount + tax).toFixed(2));
  if (grandTotal < 0 || paidAmount > grandTotal)
    return { ok: false, message: 'Invalid paid amount or total.' };

  try {
    const purchaseId = await purchaseRepository.createPurchase(
      {
        supplierId,
        invoiceNumber,
        purchaseDate,
        subtotal,
        discount,
        tax,
        grandTotal,
        paidAmount,
        dueAmount: Number((grandTotal - paidAmount).toFixed(2)),
        status: paidAmount >= grandTotal ? 'PAID' : 'PARTIAL',
        items: cleanItems,
      },
      access.profile.id
    );

    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'purchase.create',
      status: 'success',
      message: 'Purchase created',
      metadata: { purchaseId, invoiceNumber, grandTotal },
    });
    return { ok: true, purchaseId, message: 'Purchase saved and stock updated successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Invoice number already exists.' };
    throw error;
  }
}

module.exports = {
  createPurchase,
  deletePurchase,
  getPurchaseDetails,
  listProducts,
  listPurchases,
};

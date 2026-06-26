const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const purchaseRepository = require('./purchase.repository');
const { canReadPurchases, canWritePurchases } = require('./purchase.permissions');

async function requirePurchaseAccess(mode) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const allowed = mode === 'write' ? canWritePurchases(profile.role) : canReadPurchases(profile.role);
  if (!allowed) return { ok: false, message: 'You do not have permission for this purchase action.' };
  return { ok: true, profile };
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return null;
  return Number(number.toFixed(2));
}

async function listSuppliers() {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  return { ok: true, suppliers: await purchaseRepository.listSuppliers() };
}

async function createSupplier(payload = {}) {
  const access = await requirePurchaseAccess('write');
  if (!access.ok) return access;
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Supplier name is required.' };
  const openingBalance = money(payload.openingBalance);
  if (openingBalance === null) return { ok: false, message: 'Opening balance is invalid.' };
  try {
    const supplier = await purchaseRepository.createSupplier({
      name,
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      address: String(payload.address || '').trim(),
      openingBalance,
      isActive: payload.isActive !== false,
      userId: access.profile.id
    });
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'supplier.create', status: 'success', message: 'Supplier created', metadata: { supplierId: supplier.id } });
    return { ok: true, supplier, message: 'Supplier saved successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Supplier already exists.' };
    throw error;
  }
}

async function updateSupplier(id, payload = {}) {
  const access = await requirePurchaseAccess('write');
  if (!access.ok) return access;
  const supplierId = Number(id);
  const name = String(payload.name || '').trim();
  if (!Number.isInteger(supplierId) || supplierId <= 0) return { ok: false, message: 'Invalid supplier id.' };
  if (name.length < 2) return { ok: false, message: 'Supplier name is required.' };
  try {
    const supplier = await purchaseRepository.updateSupplier(supplierId, {
      name,
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      address: String(payload.address || '').trim(),
      isActive: payload.isActive !== false
    });
    if (!supplier) return { ok: false, message: 'Supplier not found.' };
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'supplier.update', status: 'success', message: 'Supplier updated', metadata: { supplierId } });
    return { ok: true, supplier, message: 'Supplier updated successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Supplier already exists.' };
    throw error;
  }
}

async function deleteSupplier(id) {
  const access = await requirePurchaseAccess('write');
  if (!access.ok) return access;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) return { ok: false, message: 'Invalid supplier id.' };
  let deleted;
  try {
    deleted = await purchaseRepository.softDeleteSupplier(supplierId);
  } catch (error) {
    if (error.code === 'SUPPLIER_BALANCE_DUE') return { ok: false, message: 'Supplier has outstanding balance. Record payment before deleting.' };
    throw error;
  }
  if (!deleted) return { ok: false, message: 'Supplier not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'supplier.delete', status: 'success', message: 'Supplier deleted', metadata: { supplierId } });
  return { ok: true, message: 'Supplier deleted successfully.' };
}

async function getSupplierDetails(supplierId) {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid supplier id.' };
  const details = await purchaseRepository.getSupplierDetails(id);
  if (!details) return { ok: false, message: 'Supplier not found.' };
  return { ok: true, ...details };
}

async function getSupplierLedger(supplierId) {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid supplier id.' };
  return { ok: true, ledger: await purchaseRepository.getSupplierLedger(id) };
}

async function recordSupplierPayment(supplierId, payload = {}) {
  const access = await requirePurchaseAccess('write');
  if (!access.ok) return access;
  const id = Number(supplierId);
  const amount = money(payload.amount);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid supplier id.' };
  if (amount === null || amount <= 0) return { ok: false, message: 'Payment amount must be greater than zero.' };
  let result;
  try {
    result = await purchaseRepository.recordSupplierPayment({
      supplierId: id,
      amount,
      paymentMethod: String(payload.paymentMethod || 'Cash').trim() || 'Cash',
      notes: String(payload.notes || '').trim()
    }, access.profile.id);
  } catch (error) {
    if (error.code === 'SUPPLIER_NO_DUE') return { ok: false, message: 'This supplier has no outstanding balance.' };
    if (error.code === 'SUPPLIER_PAYMENT_EXCEEDS_BALANCE') return { ok: false, message: `Payment cannot exceed outstanding balance Rs. ${Number(error.balance || 0).toFixed(2)}.` };
    throw error;
  }
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'supplier.payment', status: 'success', message: 'Supplier payment recorded', metadata: { supplierId: id, amount, paymentId: result.paymentId } });
  return { ok: true, payment: result, message: 'Supplier payment recorded successfully.' };
}

async function listPurchases() {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  return { ok: true, purchases: await purchaseRepository.listPurchases(), permissions: { canWrite: canWritePurchases(access.profile.role) } };
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
  const access = await requirePurchaseAccess('write');
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
      metadata: { purchaseId: id, invoiceNumber: deleted.invoiceNumber }
    });
    return { ok: true, message: 'Purchase deleted and stock reversed successfully.' };
  } catch (error) {
    if (error.code === 'PURCHASE_DELETE_NEGATIVE_STOCK') {
      return { ok: false, message: 'This purchase cannot be deleted because reversing it would make product stock negative.' };
    }
    if (error.code === 'PURCHASE_DELETE_SUPPLIER_BALANCE_CONFLICT') {
      return { ok: false, message: 'This purchase cannot be deleted because supplier payments/balance would become inconsistent.' };
    }
    if (error.code === 'PURCHASE_PRODUCT_MISSING') {
      return { ok: false, message: 'This purchase cannot be deleted because one product no longer exists.' };
    }
    throw error;
  }
}

async function createPurchase(payload = {}) {
  const access = await requirePurchaseAccess('write');
  if (!access.ok) return access;
  const supplierId = payload.supplierId ? Number(payload.supplierId) : null;
  const invoiceNumber = String(payload.invoiceNumber || '').trim();
  const purchaseDate = payload.purchaseDate || new Date().toISOString().slice(0, 10);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!invoiceNumber) return { ok: false, message: 'Invoice number is required.' };
  if (items.length === 0) return { ok: false, message: 'At least one purchase item is required.' };

  const cleanItems = [];
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const purchasePrice = money(item.purchasePrice);
    const salePrice = money(item.salePrice);
    if (!Number.isInteger(productId) || productId <= 0) return { ok: false, message: 'Invalid product in purchase item.' };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, message: 'Purchase quantity must be greater than zero.' };
    if (purchasePrice === null || salePrice === null) return { ok: false, message: 'Invalid purchase item price.' };
    cleanItems.push({
      productId,
      quantity,
      purchasePrice,
      salePrice,
      batchNumber: String(item.batchNumber || '').trim() || null,
      expirationDate: item.expirationDate || null,
      total: Number((quantity * purchasePrice).toFixed(2))
    });
  }

  const subtotal = Number(cleanItems.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  const discount = money(payload.discount);
  const tax = money(payload.tax);
  const paidAmount = money(payload.paidAmount);
  if (discount === null || tax === null || paidAmount === null) return { ok: false, message: 'Invalid purchase totals.' };
  const grandTotal = Number((subtotal - discount + tax).toFixed(2));
  if (grandTotal < 0 || paidAmount > grandTotal) return { ok: false, message: 'Invalid paid amount or total.' };

  try {
    const purchaseId = await purchaseRepository.createPurchase({
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
      items: cleanItems
    }, access.profile.id);

    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase.create', status: 'success', message: 'Purchase created', metadata: { purchaseId, invoiceNumber, grandTotal } });
    return { ok: true, purchaseId, message: 'Purchase saved and stock updated successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Invoice number already exists.' };
    throw error;
  }
}

module.exports = {
  createPurchase,
  createSupplier,
  deletePurchase,
  deleteSupplier,
  getSupplierDetails,
  getSupplierLedger,
  getPurchaseDetails,
  listPurchases,
  listSuppliers,
  recordSupplierPayment,
  updateSupplier
};

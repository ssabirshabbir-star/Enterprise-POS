const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const suppliersRepository = require('./suppliers.repository');
const { canReadPurchases, canWritePurchases } = require('../purchases/purchase.permissions');

async function requireSupplierAccess(mode) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const allowed =
    mode === 'write' ? canWritePurchases(profile.role) : canReadPurchases(profile.role);
  if (!allowed)
    return { ok: false, message: 'You do not have permission for this purchase action.' };
  return { ok: true, profile };
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return null;
  return Number(number.toFixed(2));
}

async function listSuppliers() {
  const access = await requireSupplierAccess('read');
  if (!access.ok) return access;
  return { ok: true, suppliers: await suppliersRepository.listSuppliers() };
}

async function createSupplier(payload = {}) {
  const access = await requireSupplierAccess('write');
  if (!access.ok) return access;
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Supplier name is required.' };
  const openingBalance = money(payload.openingBalance);
  if (openingBalance === null) return { ok: false, message: 'Opening balance is invalid.' };
  try {
    const supplier = await suppliersRepository.createSupplier({
      name,
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      address: String(payload.address || '').trim(),
      openingBalance,
      isActive: payload.isActive !== false,
      userId: access.profile.id,
    });
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'supplier.create',
      status: 'success',
      message: 'Supplier created',
      metadata: { supplierId: supplier.id },
    });
    return { ok: true, supplier, message: 'Supplier saved successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Supplier already exists.' };
    throw error;
  }
}

async function updateSupplier(id, payload = {}) {
  const access = await requireSupplierAccess('write');
  if (!access.ok) return access;
  const supplierId = Number(id);
  const name = String(payload.name || '').trim();
  if (!Number.isInteger(supplierId) || supplierId <= 0)
    return { ok: false, message: 'Invalid supplier id.' };
  if (name.length < 2) return { ok: false, message: 'Supplier name is required.' };
  try {
    const supplier = await suppliersRepository.updateSupplier(supplierId, {
      name,
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      address: String(payload.address || '').trim(),
      isActive: payload.isActive !== false,
    });
    if (!supplier) return { ok: false, message: 'Supplier not found.' };
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'supplier.update',
      status: 'success',
      message: 'Supplier updated',
      metadata: { supplierId },
    });
    return { ok: true, supplier, message: 'Supplier updated successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Supplier already exists.' };
    throw error;
  }
}

async function deleteSupplier(id) {
  const access = await requireSupplierAccess('write');
  if (!access.ok) return access;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId) || supplierId <= 0)
    return { ok: false, message: 'Invalid supplier id.' };
  let deleted;
  try {
    deleted = await suppliersRepository.softDeleteSupplier(supplierId);
  } catch (error) {
    if (error.code === 'SUPPLIER_BALANCE_DUE')
      return {
        ok: false,
        message: 'Supplier has outstanding balance. Record payment before deleting.',
      };
    throw error;
  }
  if (!deleted) return { ok: false, message: 'Supplier not found.' };
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'supplier.delete',
    status: 'success',
    message: 'Supplier deleted',
    metadata: { supplierId },
  });
  return { ok: true, message: 'Supplier deleted successfully.' };
}

async function getSupplierDetails(supplierId) {
  const access = await requireSupplierAccess('read');
  if (!access.ok) return access;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid supplier id.' };
  const details = await suppliersRepository.getSupplierDetails(id);
  if (!details) return { ok: false, message: 'Supplier not found.' };
  return { ok: true, ...details };
}

async function getSupplierLedger(supplierId) {
  const access = await requireSupplierAccess('read');
  if (!access.ok) return access;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid supplier id.' };
  return { ok: true, ledger: await suppliersRepository.getSupplierLedger(id) };
}

async function recordSupplierPayment(supplierId, payload = {}) {
  const access = await requireSupplierAccess('write');
  if (!access.ok) return access;
  const id = Number(supplierId);
  const amount = money(payload.amount);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid supplier id.' };
  if (amount === null || amount <= 0)
    return { ok: false, message: 'Payment amount must be greater than zero.' };
  let result;
  try {
    result = await suppliersRepository.recordSupplierPayment(
      {
        supplierId: id,
        amount,
        paymentMethod: String(payload.paymentMethod || 'Cash').trim() || 'Cash',
        notes: String(payload.notes || '').trim(),
      },
      access.profile.id
    );
  } catch (error) {
    if (error.code === 'SUPPLIER_NO_DUE')
      return { ok: false, message: 'This supplier has no outstanding balance.' };
    if (error.code === 'SUPPLIER_PAYMENT_EXCEEDS_BALANCE')
      return {
        ok: false,
        message: `Payment cannot exceed outstanding balance Rs. ${Number(error.balance || 0).toFixed(2)}.`,
      };
    throw error;
  }
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'supplier.payment',
    status: 'success',
    message: 'Supplier payment recorded',
    metadata: { supplierId: id, amount, paymentId: result.paymentId },
  });
  return { ok: true, payment: result, message: 'Supplier payment recorded successfully.' };
}

module.exports = {
  createSupplier,
  deleteSupplier,
  getSupplierDetails,
  getSupplierLedger,
  listSuppliers,
  recordSupplierPayment,
  updateSupplier,
};

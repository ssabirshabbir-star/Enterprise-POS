const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const returnsRepository = require('./returns.repository');
const { canReadReturns, canWriteReturns } = require('./returns.permissions');

async function requireReturnAccess(mode = 'read') {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const allowed = mode === 'write' ? canWriteReturns(profile.role) : canReadReturns(profile.role);
  if (!allowed) return { ok: false, message: 'You do not have permission for returns.' };
  return { ok: true, profile };
}

function generateReturnNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `RET-${date}-${Date.now().toString().slice(-7)}`;
}

async function lookupInvoice(filters = {}) {
  const access = await requireReturnAccess('read');
  if (!access.ok) return access;
  const result = await returnsRepository.findInvoice(filters);
  if (!result) return { ok: false, message: 'Invoice not found.' };
  return { ok: true, ...result };
}

async function listReturns() {
  const access = await requireReturnAccess('read');
  if (!access.ok) return access;
  return { ok: true, returns: await returnsRepository.listReturns() };
}

async function createReturn(payload = {}) {
  const access = await requireReturnAccess('write');
  if (!access.ok) return access;
  const saleId = Number(payload.saleId);
  const refundMethod = String(payload.refundMethod || '').trim();
  const reason = String(payload.reason || '').trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!Number.isInteger(saleId) || saleId <= 0) return { ok: false, message: 'Invalid invoice.' };
  if (!['Cash Refund', 'Customer Credit'].includes(refundMethod)) return { ok: false, message: 'Invalid refund method.' };
  if (reason.length < 3) return { ok: false, message: 'Return reason is required.' };
  const cleanItems = [];
  for (const item of items) {
    const saleItemId = Number(item.saleItemId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(saleItemId) || saleItemId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, message: 'Return item quantity is invalid.' };
    }
    cleanItems.push({ saleItemId, quantity: Number(quantity.toFixed(3)) });
  }
  if (cleanItems.length === 0) return { ok: false, message: 'Select at least one return item.' };

  const invoice = await returnsRepository.findInvoice({ invoiceNumber: payload.invoiceNumber });
  if (!invoice || Number(invoice.sale.id) !== saleId) return { ok: false, message: 'Invoice not found.' };
  let totalRefund = 0;
  for (const item of cleanItems) {
    const original = invoice.items.find((row) => Number(row.saleItemId) === Number(item.saleItemId));
    if (!original) return { ok: false, message: 'Return item is not part of invoice.' };
    if (item.quantity > original.returnableQuantity) return { ok: false, message: 'Return quantity exceeds sold quantity.' };
    const unitRefund = original.quantity > 0 ? Number(original.total) / Number(original.quantity) : Number(original.unitPrice);
    totalRefund += item.quantity * unitRefund;
  }
  totalRefund = Number(totalRefund.toFixed(2));

  try {
    const returnRecord = await returnsRepository.createReturn({
      returnNumber: generateReturnNumber(),
      saleId,
      invoiceNumber: payload.invoiceNumber,
      refundMethod,
      reason,
      totalRefund,
      items: cleanItems
    }, access.profile.id);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'return.create', status: 'success', message: 'Return completed', metadata: { returnId: returnRecord.id, returnNumber: returnRecord.return_number, totalRefund } });
    return { ok: true, return: { id: returnRecord.id, returnNumber: returnRecord.return_number, totalRefund }, message: 'Return completed successfully.' };
  } catch (error) {
    if (error.message === 'SALE_NOT_FOUND') return { ok: false, message: 'Invoice not found.' };
    if (error.message === 'INVALID_RETURN_ITEM') return { ok: false, message: 'Invalid return item.' };
    if (error.message === 'RETURN_QTY_EXCEEDED') return { ok: false, message: 'Return quantity exceeds sold quantity.' };
    if (error.code === '23505') return { ok: false, message: 'Duplicate return number. Please try again.' };
    throw error;
  }
}

module.exports = {
  createReturn,
  listReturns,
  lookupInvoice
};

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

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function isReceivableSale(sale) {
  return Number(sale?.grandTotal || 0) > Number(sale?.paidAmount || 0);
}

function invoiceDueAmount(sale) {
  return Math.max(
    Number((Number(sale?.grandTotal || 0) - Number(sale?.paidAmount || 0)).toFixed(2)),
    0
  );
}

function hasCouponBlock(invoice, refundTotal) {
  const sale = invoice.sale || {};
  const coupons = Array.isArray(invoice.coupons) ? invoice.coupons : [];
  if (!coupons.length) return null;
  const netAfterReturn = Number(sale.grandTotal || 0) - Number(refundTotal || 0);
  return coupons.find((coupon) => {
    const wouldDropBelowThreshold = netAfterReturn < Number(coupon.minimumPurchase || 0);
    const lockedCoupon =
      coupon.isUsed ||
      coupon.isWinner ||
      String(coupon.verificationStatus || '').toUpperCase() !== 'UNVERIFIED';
    return wouldDropBelowThreshold && lockedCoupon;
  });
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
  const notes = String(payload.notes || '').trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!Number.isInteger(saleId) || saleId <= 0) return { ok: false, message: 'Invalid invoice.' };
  if (!['Cash', 'Card', 'Bank', 'Customer Credit'].includes(refundMethod))
    return { ok: false, message: 'Invalid refund method.' };
  if (reason.length < 3) return { ok: false, message: 'Return reason is required.' };
  const cleanItems = [];
  for (const item of items) {
    const saleItemId = Number(item.saleItemId);
    const quantity = Number(item.quantity);
    if (
      !Number.isInteger(saleItemId) ||
      saleItemId <= 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return { ok: false, message: 'Return item quantity is invalid.' };
    }
    cleanItems.push({ saleItemId, quantity: Number(quantity.toFixed(3)) });
  }
  if (cleanItems.length === 0) return { ok: false, message: 'Select at least one return item.' };

  const invoice = await returnsRepository.findInvoice({ invoiceNumber: payload.invoiceNumber });
  if (!invoice || Number(invoice.sale.id) !== saleId)
    return { ok: false, message: 'Invoice not found.' };
  if (invoice.sale.status && invoice.sale.status !== 'COMPLETED') {
    return { ok: false, message: 'Only completed invoices can be returned in Returns v1.' };
  }
  if (invoice.sale.paymentMethod === 'Mixed') {
    return { ok: false, message: 'Mixed/split payment refunds are not implemented yet.' };
  }
  if (refundMethod === 'Customer Credit') {
    if (!invoice.sale.customerId || invoice.sale.isWalkInCustomer) {
      return { ok: false, message: 'Customer Credit return requires a real customer.' };
    }
    if (!isReceivableSale(invoice.sale)) {
      return {
        ok: false,
        message: 'Store credit for paid cash/card/bank sales is not implemented yet.',
      };
    }
  }
  let totalRefund = 0;
  for (const item of cleanItems) {
    const original = invoice.items.find(
      (row) => Number(row.saleItemId) === Number(item.saleItemId)
    );
    if (!original) return { ok: false, message: 'Return item is not part of invoice.' };
    if (item.quantity > original.returnableQuantity)
      return { ok: false, message: 'Return quantity exceeds sold quantity.' };
    const unitRefund =
      original.quantity > 0
        ? Number(original.total) / Number(original.quantity)
        : Number(original.unitPrice);
    totalRefund += item.quantity * unitRefund;
  }
  totalRefund = Number(totalRefund.toFixed(2));
  if (!money(totalRefund) || totalRefund <= 0)
    return { ok: false, message: 'Return refund amount is invalid.' };
  if (refundMethod === 'Customer Credit' && totalRefund > invoiceDueAmount(invoice.sale)) {
    return {
      ok: false,
      message: 'Customer Credit return cannot exceed this invoice receivable amount.',
    };
  }
  if (refundMethod !== 'Customer Credit' && Number(invoice.sale.paidAmount || 0) <= 0) {
    return { ok: false, message: 'This invoice has no paid amount to refund by cash/card/bank.' };
  }
  if (refundMethod !== 'Customer Credit' && totalRefund > Number(invoice.sale.paidAmount || 0)) {
    return { ok: false, message: 'Cash/card/bank refund cannot exceed this invoice paid amount.' };
  }
  const blockedCoupon = hasCouponBlock(invoice, totalRefund);
  if (blockedCoupon) {
    return {
      ok: false,
      message: `Return blocked because Lucky Draw coupon ${blockedCoupon.couponNo} is already used, verified, or selected as winner.`,
    };
  }

  try {
    const returnRecord = await returnsRepository.createReturn(
      {
        returnNumber: generateReturnNumber(),
        saleId,
        invoiceNumber: payload.invoiceNumber,
        refundMethod,
        reason,
        notes,
        totalRefund,
        items: cleanItems,
      },
      access.profile.id
    );
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'return.create',
      status: 'success',
      message: 'Return completed',
      metadata: {
        returnId: returnRecord.id,
        returnNumber: returnRecord.return_number,
        totalRefund,
      },
    });
    return {
      ok: true,
      return: { id: returnRecord.id, returnNumber: returnRecord.return_number, totalRefund },
      message: 'Return completed successfully.',
    };
  } catch (error) {
    if (error.message === 'SALE_NOT_FOUND') return { ok: false, message: 'Invoice not found.' };
    if (error.message === 'INVALID_RETURN_ITEM')
      return { ok: false, message: 'Invalid return item.' };
    if (error.message === 'RETURN_QTY_EXCEEDED')
      return { ok: false, message: 'Return quantity exceeds sold quantity.' };
    if (error.code === '23505')
      return { ok: false, message: 'Duplicate return number. Please try again.' };
    throw error;
  }
}

module.exports = {
  createReturn,
  listReturns,
  lookupInvoice,
};

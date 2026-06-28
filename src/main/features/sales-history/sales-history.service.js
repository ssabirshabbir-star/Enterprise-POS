const authService = require('../auth/auth.service');
const salesHistoryRepository = require('./sales-history.repository');
const { canReadSalesHistory } = require('./sales-history.permissions');

async function requireSalesHistoryAccess() {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  if (!canReadSalesHistory(profileResult.profile.role)) {
    return { ok: false, message: 'You do not have permission to view completed invoices.' };
  }
  return { ok: true, profile: profileResult.profile };
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function cleanPaymentMethod(value) {
  const method = String(value || '').trim();
  return ['Cash', 'Card', 'Bank', 'Credit', 'Mixed'].includes(method) ? method : '';
}

function cleanStatus(value) {
  const status = String(value || '')
    .trim()
    .toUpperCase();
  return ['COMPLETED', 'VOID', 'REFUNDED'].includes(status) ? status : '';
}

async function list(filters = {}) {
  const access = await requireSalesHistoryAccess();
  if (!access.ok) return access;
  const cleanFilters = {
    search: String(filters.search || '')
      .trim()
      .slice(0, 120),
    fromDate: cleanDate(filters.fromDate),
    toDate: cleanDate(filters.toDate),
    status: cleanStatus(filters.status),
    paymentMethod: cleanPaymentMethod(filters.paymentMethod),
  };
  return { ok: true, invoices: await salesHistoryRepository.listSales(cleanFilters) };
}

async function getDetails(saleId) {
  const access = await requireSalesHistoryAccess();
  if (!access.ok) return access;
  const id = Number(saleId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid invoice.' };
  const receipt = await salesHistoryRepository.getDetails(id);
  if (!receipt) return { ok: false, message: 'Invoice was not found.' };
  return { ok: true, receipt };
}

module.exports = {
  getDetails,
  list,
};

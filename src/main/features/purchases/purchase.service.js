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

const PAYMENT_METHODS = new Set(['Cash', 'Credit']);
const PAYMENT_STATUSES = new Set(['PAID', 'PARTIAL', 'UNPAID']);
const PURCHASE_TABS = new Set(['', 'DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED', 'RETURN']);
const DATE_PRESETS = new Set([
  '',
  'today',
  'yesterday',
  '7',
  '30',
  'month',
  'last-month',
  'custom',
]);
const PAGE_SIZES = new Set([10, 25, 50]);

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function strictDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return text;
}

function presetRange(datePreset, today = new Date()) {
  const businessToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (datePreset === 'today') {
    const value = localDateString(businessToday);
    return { dateFrom: value, dateTo: value };
  }
  if (datePreset === 'yesterday') {
    const value = localDateString(addDays(businessToday, -1));
    return { dateFrom: value, dateTo: value };
  }
  if (datePreset === '7' || datePreset === '30') {
    const days = Number(datePreset);
    return {
      dateFrom: localDateString(addDays(businessToday, -(days - 1))),
      dateTo: localDateString(businessToday),
    };
  }
  if (datePreset === 'month') {
    return {
      dateFrom: localDateString(new Date(businessToday.getFullYear(), businessToday.getMonth(), 1)),
      dateTo: localDateString(businessToday),
    };
  }
  if (datePreset === 'last-month') {
    return {
      dateFrom: localDateString(
        new Date(businessToday.getFullYear(), businessToday.getMonth() - 1, 1)
      ),
      dateTo: localDateString(new Date(businessToday.getFullYear(), businessToday.getMonth(), 0)),
    };
  }
  return { dateFrom: null, dateTo: null };
}

function parsePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizePurchaseListFilters(filters = {}) {
  const datePresetInput = String(filters.datePreset || '').trim();
  if (datePresetInput === 'year') {
    return {
      ok: false,
      message:
        'This Financial Year filter is unavailable because no authoritative financial-year configuration exists.',
      code: 'PURCHASE_FINANCIAL_YEAR_UNSUPPORTED',
    };
  }
  const datePreset = DATE_PRESETS.has(datePresetInput) ? datePresetInput : '';
  let dateFrom = strictDate(filters.dateFrom);
  let dateTo = strictDate(filters.dateTo);
  if ((filters.dateFrom && !dateFrom) || (filters.dateTo && !dateTo)) {
    return {
      ok: false,
      message: 'Purchase date filters must use YYYY-MM-DD dates.',
      code: 'PURCHASE_INVALID_DATE_FILTER',
    };
  }
  if (datePreset && datePreset !== 'custom') {
    ({ dateFrom, dateTo } = presetRange(datePreset));
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return {
      ok: false,
      message: 'Purchase Date From cannot be later than Date To.',
      code: 'PURCHASE_INVALID_DATE_RANGE',
    };
  }

  const supplierId = filters.supplierId ? Number(filters.supplierId) : null;
  if (filters.supplierId && (!Number.isInteger(supplierId) || supplierId <= 0)) {
    return { ok: false, message: 'Invalid supplier filter.', code: 'PURCHASE_INVALID_SUPPLIER' };
  }

  const paymentMethod = String(filters.paymentMethod || filters.method || '').trim();
  const paymentStatus = String(filters.paymentStatus || filters.payment || '')
    .trim()
    .toUpperCase();
  const purchaseTab = String(filters.purchaseTab || filters.status || '')
    .trim()
    .toUpperCase();
  const pageSizeInput = parsePositiveInt(filters.pageSize, 10);
  const pageSize = PAGE_SIZES.has(pageSizeInput) ? pageSizeInput : 10;

  return {
    ok: true,
    filters: {
      search: String(filters.search || '')
        .trim()
        .slice(0, 140),
      dateFrom,
      dateTo,
      datePreset,
      supplierId,
      paymentMethod: PAYMENT_METHODS.has(paymentMethod) ? paymentMethod : '',
      paymentStatus: PAYMENT_STATUSES.has(paymentStatus) ? paymentStatus : '',
      purchaseTab: PURCHASE_TABS.has(purchaseTab) ? purchaseTab : '',
      page: parsePositiveInt(filters.page, 1),
      pageSize,
    },
  };
}

async function listProducts() {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  return { ok: true, products: await purchaseRepository.listProducts() };
}

async function listPurchases(filters = {}) {
  const access = await requirePurchaseAccess('read');
  if (!access.ok) return access;
  const normalized = normalizePurchaseListFilters(filters);
  if (!normalized.ok) return normalized;
  const result = await purchaseRepository.listPurchases(normalized.filters);
  return {
    ok: true,
    purchases: result.purchases,
    filters: normalized.filters,
    pagination: result.pagination,
    summary: result.summary,
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
  normalizePurchaseListFilters,
};

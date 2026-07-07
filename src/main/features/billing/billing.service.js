const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const billingRepository = require('./billing.repository');
const {
  canDeleteHeldSales,
  canOverrideSalePrice,
  canReadSales,
  canRefundOrExchangeSales,
  canWriteSales,
} = require('./billing.permissions');

async function requireSalesAccess(mode) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const allowed = mode === 'write' ? canWriteSales(profile.role) : canReadSales(profile.role);
  if (!allowed) return { ok: false, message: 'You do not have permission for POS billing.' };
  return { ok: true, profile };
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function quantity(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(3)) : null;
}

function pricesDiffer(left, right) {
  return Number(Number(left || 0).toFixed(2)) !== Number(Number(right || 0).toFixed(2));
}

function generateInvoiceNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const terminal =
    String(process.env.POS_TERMINAL_CODE || require('os').hostname() || 'T1')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 8) || 'T1';
  return `POS-${terminal}-${date}-${Date.now().toString().slice(-7)}`;
}

async function generateUniqueInvoiceNumber() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = generateInvoiceNumber();
    if (!(await billingRepository.invoiceExists(invoiceNumber))) {
      return invoiceNumber;
    }
  }
  throw new Error('Could not generate invoice number.');
}

async function searchProducts(filters) {
  const access = await requireSalesAccess('read');
  if (!access.ok) return access;
  const payload = typeof filters === 'object' && filters !== null ? filters : { search: filters };
  const cleanSearch = String(payload.search || '').trim();
  const categoryId = Number(payload.categoryId || 0);
  return {
    ok: true,
    products: await billingRepository.searchProducts({ search: cleanSearch, categoryId }),
  };
}

async function lookupBarcode(barcode) {
  const access = await requireSalesAccess('read');
  if (!access.ok) return access;
  const cleanBarcode = String(barcode || '').trim();
  if (!cleanBarcode) return { ok: false, message: 'Barcode is required.' };
  const product = await billingRepository.findProductByBarcode(cleanBarcode);
  if (!product || !product.isActive)
    return { ok: false, message: 'Product not found or inactive.' };
  if (product.currentStock <= 0) return { ok: false, message: 'Product is out of stock.' };
  return { ok: true, product };
}

async function listCustomers(search) {
  const access = await requireSalesAccess('read');
  if (!access.ok) return access;
  return { ok: true, customers: await billingRepository.listCustomers(search) };
}

async function createCustomer(payload = {}) {
  const access = await requireSalesAccess('write');
  if (!access.ok) return access;
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Customer name is required.' };
  const customer = await billingRepository.createCustomer({
    name,
    phone: String(payload.phone || '').trim(),
    email: String(payload.email || '').trim(),
    address: String(payload.address || '').trim(),
    creditLimit: money(payload.creditLimit) || 0,
  });
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'customer.create',
    status: 'success',
    message: 'Customer created',
    metadata: { customerId: customer.id },
  });
  return { ok: true, customer, message: 'Customer saved successfully.' };
}

async function completeSale(payload = {}) {
  const access = await requireSalesAccess('write');
  if (!access.ok) return access;
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return { ok: false, message: 'Cart is empty.' };

  const cleanItems = [];
  const priceOverrides = [];
  const productPolicies = await billingRepository.getSaleProductPolicies(
    items.map((item) => item.productId)
  );
  const canOverridePrice = canOverrideSalePrice(access.profile);

  for (const item of items) {
    const productId = Number(item.productId);
    const itemQuantity = quantity(item.quantity);
    const requestedUnitPrice = money(item.unitPrice);
    const discount = money(item.discount);
    if (!Number.isInteger(productId) || productId <= 0)
      return { ok: false, message: 'Invalid cart product.' };
    const productPolicy = productPolicies.get(productId);
    if (!productPolicy || !productPolicy.isActive)
      return { ok: false, message: 'One or more products are inactive.' };
    const masterUnitPrice = money(productPolicy.salePrice);
    const priceWasChanged = pricesDiffer(requestedUnitPrice, masterUnitPrice);
    let unitPrice = masterUnitPrice;
    if (productPolicy.allowSalePriceOverride && priceWasChanged) {
      if (!canOverridePrice)
        return { ok: false, message: 'You do not have permission to override sale price.' };
      const reason = String(item.priceOverrideReason || '').trim();
      if (!reason) return { ok: false, message: 'Price override reason is required.' };
      unitPrice = requestedUnitPrice;
      priceOverrides.push({
        productId,
        originalUnitPrice: masterUnitPrice,
        overriddenUnitPrice: unitPrice,
        reason,
      });
    }
    if (itemQuantity === null)
      return { ok: false, message: 'Cart quantity must be greater than zero.' };
    if (unitPrice === null || discount === null)
      return { ok: false, message: 'Invalid cart price or discount.' };
    const gross = Number((itemQuantity * unitPrice).toFixed(2));
    if (discount > gross) return { ok: false, message: 'Line discount cannot exceed line amount.' };
    cleanItems.push({
      productId,
      quantity: itemQuantity,
      unitPrice,
      discount,
      total: Number((gross - discount).toFixed(2)),
    });
  }

  const subtotal = Number(cleanItems.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  const discount = money(payload.discount);
  const tax = money(payload.tax);
  const paidAmount = money(payload.paidAmount);
  if (discount === null || tax === null || paidAmount === null)
    return { ok: false, message: 'Invalid billing totals.' };
  if (discount > subtotal) return { ok: false, message: 'Cart discount cannot exceed subtotal.' };
  const grandTotal = Number((subtotal - discount + tax).toFixed(2));
  const paymentMethod = String(payload.paymentMethod || 'Cash').trim();
  if (!['Cash', 'Card', 'Bank', 'Credit', 'Mixed'].includes(paymentMethod))
    return { ok: false, message: 'Payment method is invalid.' };
  if (paidAmount < grandTotal && paymentMethod !== 'Credit')
    return {
      ok: false,
      message: 'Paid amount cannot be less than grand total unless payment method is Credit.',
    };
  if (paymentMethod === 'Credit' && !payload.customerId)
    return { ok: false, message: 'Credit sale requires a customer.' };
  const invoiceNumber = await generateUniqueInvoiceNumber();

  try {
    const sale = await billingRepository.createSale(
      {
        invoiceNumber,
        customerId: payload.customerId ? Number(payload.customerId) : null,
        subtotal,
        discount,
        tax,
        grandTotal,
        paidAmount,
        changeAmount: Math.max(Number((paidAmount - grandTotal).toFixed(2)), 0),
        dueAmount: Math.max(Number((grandTotal - paidAmount).toFixed(2)), 0),
        paymentMethod,
        items: cleanItems,
      },
      access.profile.id
    );
    const receipt = await billingRepository.getSaleReceipt(sale.id);
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'sale.complete',
      status: 'success',
      message: 'Sale completed',
      metadata: {
        saleId: sale.id,
        invoiceNumber,
        grandTotal,
        priceOverrideCount: priceOverrides.length,
        priceOverrides,
      },
    });
    return { ok: true, receipt, message: 'Sale completed successfully.' };
  } catch (error) {
    if (error.message.includes('Insufficient stock'))
      return { ok: false, message: 'Insufficient stock for one or more products.' };
    if (error.message.includes('inactive'))
      return { ok: false, message: 'One or more products are inactive.' };
    if (error.message === 'CREDIT_SALE_REQUIRES_CUSTOMER')
      return { ok: false, message: 'Credit sale requires a real customer, not Walk-in Customer.' };
    if (error.message === 'CREDIT_LIMIT_EXCEEDED')
      return { ok: false, message: 'Customer credit limit exceeded.' };
    if (error.code === '23505')
      return { ok: false, message: 'Duplicate invoice number. Please try again.' };
    throw error;
  }
}

async function holdSale(payload = {}) {
  const access = await requireSalesAccess('write');
  if (!access.ok) return access;
  if (!Array.isArray(payload.items) || payload.items.length === 0)
    return { ok: false, message: 'Cannot hold an empty cart.' };
  const hold = await billingRepository.holdSale(payload, access.profile.id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'sale.hold',
    status: 'success',
    message: 'Sale held',
    metadata: hold,
  });
  return { ok: true, hold, message: 'Sale held successfully.' };
}

async function listHeldSales() {
  const access = await requireSalesAccess('read');
  if (!access.ok) return access;
  const holds = await billingRepository.listHeldSales(access.profile.id);
  return { ok: true, holds, permissions: { canDelete: canDeleteHeldSales(access.profile.role) } };
}

async function deleteHeldSale(holdId) {
  const access = await requireSalesAccess('write');
  if (!access.ok) return access;
  if (!canDeleteHeldSales(access.profile.role))
    return { ok: false, message: 'Only Admin or Manager can delete held sales.' };
  const id = Number(holdId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid held sale.' };
  const deleted = await billingRepository.deleteHeldSale(id);
  if (!deleted) return { ok: false, message: 'Held sale not found.' };
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'sale.hold.delete',
    status: 'success',
    message: 'Held sale deleted',
    metadata: { holdId: id },
  });
  return { ok: true, message: 'Held sale deleted.' };
}

async function getLastReceipt() {
  const access = await requireSalesAccess('read');
  if (!access.ok) return access;
  const receipt = await billingRepository.getLastSaleReceipt(access.profile.id);
  if (!receipt) return { ok: false, message: 'No previous bill found for this cashier.' };
  return { ok: true, receipt };
}

async function validateInvoiceAction(payload = {}) {
  const access = await requireSalesAccess('write');
  if (!access.ok) return access;
  if (!canRefundOrExchangeSales(access.profile.role)) {
    return { ok: false, message: 'Only Admin or Manager can process refund or exchange requests.' };
  }
  const invoiceNumber = String(payload.invoiceNumber || '').trim();
  const action = String(payload.action || '')
    .trim()
    .toLowerCase();
  if (!invoiceNumber) return { ok: false, message: 'Invoice number is required.' };
  if (!['refund', 'exchange'].includes(action))
    return { ok: false, message: 'Invalid sale action.' };
  const receipt = await billingRepository.getSaleReceiptByInvoice(invoiceNumber);
  if (!receipt) return { ok: false, message: 'Invoice was not found in the database.' };
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: `sale.${action}.request`,
    status: 'success',
    message: `${action} requested`,
    metadata: { invoiceNumber: receipt.invoiceNumber, saleId: receipt.id },
  });
  return {
    ok: true,
    receipt,
    message: `${action === 'refund' ? 'Refund' : 'Exchange'} request verified for ${receipt.invoiceNumber}.`,
  };
}

module.exports = {
  completeSale,
  createCustomer,
  deleteHeldSale,
  holdSale,
  listCustomers,
  listHeldSales,
  lookupBarcode,
  searchProducts,
  getLastReceipt,
  validateInvoiceAction,
};

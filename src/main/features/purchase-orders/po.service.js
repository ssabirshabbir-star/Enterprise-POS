const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const poRepository = require('./po.repository');

const READ_ROLES = new Set(['Admin', 'Manager', 'Warehouse']);
const CREATE_ROLES = new Set(['Admin', 'Manager']);
const APPROVE_ROLES = new Set(['Admin', 'Manager']);
const RECEIVE_ROLES = new Set(['Admin', 'Manager', 'Warehouse']);

async function requirePoAccess(mode = 'read') {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const role = profileResult.profile.role;
  const roles = mode === 'receive' ? RECEIVE_ROLES : mode === 'approve' ? APPROVE_ROLES : mode === 'write' ? CREATE_ROLES : READ_ROLES;
  if (!roles.has(role)) return { ok: false, message: 'You do not have permission for this procurement action.' };
  return { ok: true, profile: profileResult.profile };
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function qty(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(3)) : null;
}

function cleanItems(items = [], field = 'orderedQty') {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, message: 'At least one item is required.' };
  const clean = [];
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = qty(item[field] || item.quantity || item.receivedQty || item.requiredQty);
    const cost = money(item.cost);
    const salePrice = money(item.salePrice);
    if (field !== 'receivedQty' && (!Number.isInteger(productId) || productId <= 0)) return { ok: false, message: 'Invalid product in item.' };
    if (quantity === null) return { ok: false, message: 'Item quantity must be greater than zero.' };
    if (field === 'orderedQty' && (cost === null || salePrice === null)) return { ok: false, message: 'Invalid item price.' };
    clean.push({
      productId,
      purchaseOrderItemId: Number(item.purchaseOrderItemId || item.id || 0),
      orderedQty: quantity,
      receivedQty: quantity,
      requiredQty: quantity,
      damagedQty: Math.max(0, Number(item.damagedQty || 0)),
      rejectedQty: Math.max(0, Number(item.rejectedQty || 0)),
      reason: String(item.reason || '').trim(),
      cost: cost ?? 0,
      salePrice: salePrice ?? 0,
      total: cost === null ? 0 : Number((quantity * cost).toFixed(2))
    });
  }
  return { ok: true, items: clean };
}

function cleanOrderPayload(payload = {}) {
  const supplierId = payload.supplierId ? Number(payload.supplierId) : null;
  const requisitionId = payload.requisitionId ? Number(payload.requisitionId) : null;
  const expectedDate = String(payload.expectedDate || '').trim() || null;
  const discount = money(payload.discount);
  const tax = money(payload.tax);
  const items = cleanItems(payload.items, 'orderedQty');
  if (supplierId !== null && (!Number.isInteger(supplierId) || supplierId <= 0)) return { ok: false, message: 'Invalid supplier.' };
  if (requisitionId !== null && (!Number.isInteger(requisitionId) || requisitionId <= 0)) return { ok: false, message: 'Invalid requisition.' };
  if (!items.ok) return items;
  if (discount === null || tax === null) return { ok: false, message: 'Invalid PO totals.' };
  const subtotal = Number(items.items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  if (discount > subtotal) return { ok: false, message: 'Discount cannot exceed subtotal.' };
  return {
    ok: true,
    payload: {
      requisitionId,
      supplierId,
      poNumber: String(payload.poNumber || '').trim() || null,
      expectedDate,
      subtotal,
      discount,
      tax,
      total: Number((subtotal - discount + tax).toFixed(2)),
      status: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(String(payload.status || '').toUpperCase())
        ? String(payload.status).toUpperCase()
        : 'PENDING_APPROVAL',
      notes: String(payload.notes || '').trim(),
      items: items.items
    }
  };
}

function cleanRequisitionPayload(payload = {}) {
  const items = cleanItems(payload.items, 'requiredQty');
  if (!items.ok) return items;
  return {
    ok: true,
    payload: {
      requestedDate: String(payload.requestedDate || '').trim() || new Date().toISOString().slice(0, 10),
      department: String(payload.department || '').trim(),
      location: String(payload.location || '').trim(),
      reason: String(payload.reason || '').trim(),
      priority: String(payload.priority || 'Normal').trim() || 'Normal',
      items: items.items
    }
  };
}

async function listRequisitions(filters = {}) {
  const access = await requirePoAccess('read');
  if (!access.ok) return access;
  return {
    ok: true,
    requisitions: await poRepository.listRequisitions(filters),
    permissions: {
      canCreate: CREATE_ROLES.has(access.profile.role),
      canApprove: APPROVE_ROLES.has(access.profile.role)
    }
  };
}

async function createRequisition(payload = {}) {
  const access = await requirePoAccess('write');
  if (!access.ok) return access;
  const clean = cleanRequisitionPayload(payload);
  if (!clean.ok) return clean;
  const requisition = await poRepository.createRequisition(clean.payload, access.profile.id);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'requisition.create', status: 'success', message: 'Purchase requisition created', metadata: { requisitionId: requisition.id } });
  return { ok: true, requisition, message: 'Purchase requisition created.' };
}

async function updateRequisitionStatus(id, status, notes = '') {
  const access = await requirePoAccess(status === 'SUBMITTED' ? 'write' : 'approve');
  if (!access.ok) return access;
  const requisitionId = Number(id);
  if (!Number.isInteger(requisitionId) || requisitionId <= 0) return { ok: false, message: 'Invalid requisition.' };
  const current = await poRepository.getRequisition(requisitionId);
  if (!current) return { ok: false, message: 'Requisition not found.' };
  if (status === 'SUBMITTED' && current.status !== 'DRAFT') return { ok: false, message: 'Only draft requisitions can be submitted.' };
  if (['APPROVED', 'REJECTED'].includes(status) && current.status !== 'SUBMITTED') return { ok: false, message: 'Only submitted requisitions can be approved or rejected.' };
  const requisition = await poRepository.updateRequisitionStatus(requisitionId, status, access.profile.id, String(notes || '').trim());
  await activityRepository.createActivityLog({ userId: access.profile.id, action: `requisition.${status.toLowerCase()}`, status: 'success', message: `Requisition ${status.toLowerCase()}`, metadata: { requisitionId } });
  return { ok: true, requisition, message: `Requisition ${status.replaceAll('_', ' ').toLowerCase()}.` };
}

async function listOrders(filters = {}) {
  const access = await requirePoAccess('read');
  if (!access.ok) return access;
  return {
    ok: true,
    orders: await poRepository.listOrders(filters),
    permissions: {
      canCreate: CREATE_ROLES.has(access.profile.role),
      canApprove: APPROVE_ROLES.has(access.profile.role),
      canReceive: RECEIVE_ROLES.has(access.profile.role)
    }
  };
}

async function getPageData() {
  const access = await requirePoAccess('read');
  if (!access.ok) return access;
  const [stats, warehouses, nextNumber] = await Promise.all([
    poRepository.getStats(),
    poRepository.listWarehouses(),
    poRepository.generateUniquePoNumber()
  ]);
  return { ok: true, stats, warehouses, nextNumber };
}

async function getOrder(id) {
  const access = await requirePoAccess('read');
  if (!access.ok) return access;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) return { ok: false, message: 'Invalid purchase order.' };
  const order = await poRepository.getOrder(orderId);
  if (!order) return { ok: false, message: 'Purchase order not found.' };
  return { ok: true, order };
}

async function createOrder(payload = {}) {
  const access = await requirePoAccess('write');
  if (!access.ok) return access;
  const clean = cleanOrderPayload(payload);
  if (!clean.ok) return clean;
  try {
    const order = await poRepository.createOrder(clean.payload, access.profile.id);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase_order.create', status: 'success', message: 'Purchase order created', metadata: { purchaseOrderId: order.id, poNumber: order.poNumber, requisitionId: order.requisitionId } });
    return { ok: true, order, message: 'Purchase order created for internal approval. Stock has not been updated.' };
  } catch (error) {
    if (error.message === 'REQUISITION_NOT_APPROVED') return { ok: false, message: 'Only approved requisitions can be converted to PO.' };
    if (error.message === 'REQUISITION_NOT_FOUND') return { ok: false, message: 'Requisition not found.' };
    if (error.code === '23505') return { ok: false, message: 'PO number already exists.' };
    throw error;
  }
}

async function convertRequisitionToOrder(requisitionId, payload = {}) {
  const access = await requirePoAccess('write');
  if (!access.ok) return access;
  const supplierId = Number(payload.supplierId);
  if (!Number.isInteger(supplierId) || supplierId <= 0) return { ok: false, message: 'Supplier is required before converting to PO.' };
  try {
    const order = await poRepository.convertRequisitionToOrder(Number(requisitionId), {
      supplierId,
      expectedDate: String(payload.expectedDate || '').trim() || null,
      discount: money(payload.discount) || 0,
      tax: money(payload.tax) || 0,
      notes: String(payload.notes || '').trim()
    }, access.profile.id);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'requisition.convert_to_po', status: 'success', message: 'Requisition converted to PO', metadata: { requisitionId: Number(requisitionId), purchaseOrderId: order.id } });
    return { ok: true, order, message: 'Approved requisition converted to purchase order.' };
  } catch (error) {
    if (error.message === 'REQUISITION_NOT_APPROVED') return { ok: false, message: 'Only approved requisitions can be converted.' };
    if (error.message === 'REQUISITION_NOT_FOUND') return { ok: false, message: 'Requisition not found.' };
    throw error;
  }
}

async function approveOrder(id, notes = '') {
  const access = await requirePoAccess('approve');
  if (!access.ok) return access;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) return { ok: false, message: 'Invalid purchase order.' };
  const current = await poRepository.getOrder(orderId);
  if (!current) return { ok: false, message: 'Purchase order not found.' };
  if (!['DRAFT', 'PENDING', 'PENDING_APPROVAL'].includes(current.status)) return { ok: false, message: 'Only draft or pending approval POs can be approved.' };
  const order = await poRepository.updateStatus(orderId, 'APPROVED', access.profile.id, notes);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase_order.approve', status: 'success', message: 'Purchase order approved', metadata: { purchaseOrderId: orderId } });
  return { ok: true, order, message: 'Purchase order approved. It can now be sent to the supplier.' };
}

async function sendToSupplier(id, notes = '') {
  const access = await requirePoAccess('approve');
  if (!access.ok) return access;
  const order = await poRepository.markSentToSupplier(Number(id), access.profile.id, String(notes || '').trim());
  if (!order) return { ok: false, message: 'Only approved purchase orders can be sent to supplier.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase_order.send_to_supplier', status: 'success', message: 'PO sent to supplier', metadata: { purchaseOrderId: Number(id) } });
  return { ok: true, order, message: 'Purchase order marked as sent to supplier.' };
}

async function confirmSupplier(id, payload = {}) {
  const access = await requirePoAccess('approve');
  if (!access.ok) return access;
  const order = await poRepository.confirmSupplier(Number(id), {
    supplierReferenceNumber: String(payload.supplierReferenceNumber || '').trim(),
    expectedDate: String(payload.expectedDate || '').trim() || null,
    notes: String(payload.notes || '').trim()
  });
  if (!order) return { ok: false, message: 'Only approved or sent POs can be supplier-confirmed.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase_order.supplier_confirm', status: 'success', message: 'Supplier confirmed PO', metadata: { purchaseOrderId: Number(id) } });
  return { ok: true, order, message: 'Supplier confirmation saved.' };
}

async function cancelOrder(id, notes = '') {
  const access = await requirePoAccess('approve');
  if (!access.ok) return access;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) return { ok: false, message: 'Invalid purchase order.' };
  const current = await poRepository.getOrder(orderId);
  if (!current) return { ok: false, message: 'Purchase order not found.' };
  if (['FULLY_RECEIVED', 'INVOICED', 'CLOSED', 'CANCELLED'].includes(current.status)) return { ok: false, message: 'This PO cannot be cancelled.' };
  const order = await poRepository.updateStatus(orderId, 'CANCELLED', access.profile.id, notes);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase_order.cancel', status: 'success', message: 'Purchase order cancelled', metadata: { purchaseOrderId: orderId } });
  return { ok: true, order, message: 'Purchase order cancelled.' };
}

async function receiveOrder(payload = {}) {
  const access = await requirePoAccess('receive');
  if (!access.ok) return access;
  const purchaseOrderId = Number(payload.purchaseOrderId);
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) return { ok: false, message: 'Purchase order is required.' };
  const receivedItems = cleanItems(payload.items, 'receivedQty');
  if (!receivedItems.ok) return receivedItems;
  for (const item of receivedItems.items) {
    if (!Number.isInteger(item.purchaseOrderItemId) || item.purchaseOrderItemId <= 0) return { ok: false, message: 'Invalid receiving item.' };
  }
  const subtotal = Number(receivedItems.items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  const discount = money(payload.discount);
  const tax = money(payload.tax);
  if (discount === null || tax === null) return { ok: false, message: 'Invalid receiving totals.' };
  if (discount > subtotal) return { ok: false, message: 'Discount cannot exceed received subtotal.' };
  try {
    const result = await poRepository.receiveOrder({
      purchaseOrderId,
      subtotal,
      discount,
      tax,
      total: Number((subtotal - discount + tax).toFixed(2)),
      notes: String(payload.notes || '').trim(),
      items: receivedItems.items
    }, access.profile.id);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase_order.receive', status: 'success', message: 'Goods received against PO', metadata: { purchaseOrderId, receiptId: result.receipt.id } });
    return { ok: true, ...result, message: 'Goods received and stock updated. Create the purchase invoice when ready.' };
  } catch (error) {
    if (error.message === 'PO_NOT_FOUND') return { ok: false, message: 'Purchase order not found.' };
    if (error.message === 'PO_NOT_RECEIVABLE') return { ok: false, message: 'This purchase order cannot be received in its current status.' };
    if (error.message === 'RECEIVE_EXCEEDS_ORDERED') return { ok: false, message: 'Received quantity cannot exceed ordered quantity.' };
    if (error.code === '23505') return { ok: false, message: 'Goods receipt number already exists. Please try again.' };
    throw error;
  }
}

async function createInvoiceFromReceipt(payload = {}) {
  const access = await requirePoAccess('write');
  if (!access.ok) return access;
  const goodsReceiptId = Number(payload.goodsReceiptId);
  if (!Number.isInteger(goodsReceiptId) || goodsReceiptId <= 0) return { ok: false, message: 'Goods receipt is required.' };
  const discount = money(payload.discount);
  const tax = money(payload.tax);
  const paidAmount = money(payload.paidAmount);
  if (discount === null || tax === null || paidAmount === null) return { ok: false, message: 'Invalid invoice totals.' };
  try {
    const invoice = await poRepository.createInvoiceFromReceipt({
      goodsReceiptId,
      invoiceNumber: String(payload.invoiceNumber || '').trim() || null,
      supplierInvoiceNumber: String(payload.supplierInvoiceNumber || '').trim(),
      invoiceDate: String(payload.invoiceDate || '').trim() || new Date().toISOString().slice(0, 10),
      discount,
      tax,
      paidAmount
    }, access.profile.id);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'purchase_invoice.create', status: 'success', message: 'Purchase invoice created from goods receipt', metadata: invoice });
    return { ok: true, invoice, message: 'Purchase invoice created and supplier ledger updated.' };
  } catch (error) {
    if (error.message === 'RECEIPT_NOT_FOUND') return { ok: false, message: 'Goods receipt not found.' };
    if (error.message === 'RECEIPT_ALREADY_INVOICED') return { ok: false, message: 'This goods receipt already has an invoice.' };
    if (error.message === 'INVALID_INVOICE_TOTALS') return { ok: false, message: 'Discount or paid amount is invalid.' };
    if (error.code === '23505') return { ok: false, message: 'Purchase invoice number already exists.' };
    throw error;
  }
}

async function listReceipts(purchaseOrderId) {
  const access = await requirePoAccess('read');
  if (!access.ok) return access;
  return { ok: true, receipts: await poRepository.listReceipts(purchaseOrderId ? Number(purchaseOrderId) : null) };
}

module.exports = {
  approveOrder,
  cancelOrder,
  confirmSupplier,
  convertRequisitionToOrder,
  createInvoiceFromReceipt,
  createOrder,
  createRequisition,
  getOrder,
  getPageData,
  listOrders,
  listReceipts,
  listRequisitions,
  receiveOrder,
  sendToSupplier,
  updateRequisitionStatus
};

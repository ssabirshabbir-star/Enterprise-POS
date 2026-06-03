const { getPool, withTransaction } = require('../../database/connection');

function number(value) {
  return Number(value || 0);
}

function mapOrder(row) {
  return row && {
    id: Number(row.id),
    poNumber: row.po_number,
    requisitionId: row.requisition_id ? Number(row.requisition_id) : null,
    requisitionNumber: row.requisition_number || null,
    supplierId: row.supplier_id ? Number(row.supplier_id) : null,
    supplierName: row.supplier_name || 'No supplier',
    status: row.status,
    expectedDate: row.expected_date,
    supplierExpectedDeliveryDate: row.supplier_expected_delivery_date,
    supplierReferenceNumber: row.supplier_reference_number || '',
    supplierConfirmationNotes: row.supplier_confirmation_notes || '',
    supplierSentAt: row.supplier_sent_at,
    supplierConfirmedAt: row.supplier_confirmed_at,
    approvalNotes: row.approval_notes || '',
    rejectionReason: row.rejection_reason || '',
    subtotal: number(row.subtotal),
    discount: number(row.discount),
    tax: number(row.tax),
    total: number(row.total),
    notes: row.notes || '',
    createdByName: row.created_by_name,
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    receivedTotal: number(row.received_total),
    orderedTotal: number(row.ordered_total)
  };
}

function mapOrderItem(row) {
  const orderedQty = number(row.ordered_qty);
  const receivedQty = number(row.received_qty);
  return {
    id: Number(row.id),
    purchaseOrderId: Number(row.purchase_order_id),
    productId: Number(row.product_id),
    productName: row.product_name,
    sku: row.sku,
    orderedQty,
    receivedQty,
    remainingQty: Number((orderedQty - receivedQty).toFixed(3)),
    cost: number(row.cost),
    salePrice: number(row.sale_price),
    total: number(row.total)
  };
}

function mapReceipt(row) {
  return row && {
    id: Number(row.id),
    receiptNumber: row.receipt_number,
    purchaseOrderId: Number(row.purchase_order_id),
    purchaseId: row.purchase_id ? Number(row.purchase_id) : null,
    supplierId: row.supplier_id ? Number(row.supplier_id) : null,
    supplierName: row.supplier_name || 'No supplier',
    receivedAt: row.received_at,
    subtotal: number(row.subtotal),
    discount: number(row.discount),
    tax: number(row.tax),
    total: number(row.total),
    paidAmount: number(row.paid_amount),
    dueAmount: number(row.due_amount),
    notes: row.notes || '',
    createdByName: row.created_by_name
  };
}

function mapRequisition(row) {
  return row && {
    id: Number(row.id),
    requisitionNumber: row.requisition_number,
    requestedBy: row.requested_by_name || 'Unknown',
    requestedById: row.requested_by ? Number(row.requested_by) : null,
    requestedDate: row.requested_date,
    department: row.department || '',
    location: row.location || '',
    reason: row.reason || '',
    priority: row.priority || 'Normal',
    status: row.status,
    approvalNotes: row.approval_notes || '',
    rejectionReason: row.rejection_reason || '',
    convertedPurchaseOrderId: row.converted_purchase_order_id ? Number(row.converted_purchase_order_id) : null,
    itemCount: Number(row.item_count || 0),
    totalQuantity: number(row.total_quantity),
    createdAt: row.created_at
  };
}

function datedPrefix(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Date.now().toString().slice(-6)}`;
}

async function uniqueNumber(table, column, prefix) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = datedPrefix(prefix);
    const exists = await getPool().query(`SELECT id FROM ${table} WHERE LOWER(${column}) = LOWER($1) LIMIT 1`, [candidate]);
    if (!exists.rows[0]) return candidate;
  }
  throw new Error('NUMBER_GENERATION_FAILED');
}

async function generateUniquePoNumber() {
  return uniqueNumber('purchase_orders', 'po_number', 'PO');
}

async function generateRequisitionNumber() {
  return uniqueNumber('purchase_requisitions', 'requisition_number', 'REQ');
}

async function generateReceiptNumber() {
  return uniqueNumber('goods_receipts', 'receipt_number', 'GRN');
}

async function generatePurchaseInvoiceNumber() {
  return uniqueNumber('purchases', 'invoice_number', 'PINV');
}

async function listRequisitions(filters = {}) {
  const params = [];
  const where = ['requisitions.deleted_at IS NULL'];
  if (filters.status) {
    params.push(String(filters.status).toUpperCase());
    where.push(`requisitions.status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim().toLowerCase()}%`);
    where.push(`(LOWER(requisitions.requisition_number) LIKE $${params.length} OR LOWER(COALESCE(requisitions.department,'')) LIKE $${params.length})`);
  }
  const result = await getPool().query(
    `
      SELECT requisitions.*, users.full_name AS requested_by_name,
             COUNT(items.id)::int AS item_count,
             COALESCE(SUM(items.required_qty), 0)::numeric AS total_quantity
      FROM purchase_requisitions requisitions
      LEFT JOIN users ON users.id = requisitions.requested_by
      LEFT JOIN purchase_requisition_items items ON items.requisition_id = requisitions.id
      WHERE ${where.join(' AND ')}
      GROUP BY requisitions.id, users.full_name
      ORDER BY requisitions.created_at DESC
      LIMIT 200
    `,
    params
  );
  return result.rows.map(mapRequisition);
}

async function getRequisition(id) {
  const result = await getPool().query(
    `
      SELECT requisitions.*, users.full_name AS requested_by_name,
             COUNT(items.id)::int AS item_count,
             COALESCE(SUM(items.required_qty), 0)::numeric AS total_quantity
      FROM purchase_requisitions requisitions
      LEFT JOIN users ON users.id = requisitions.requested_by
      LEFT JOIN purchase_requisition_items items ON items.requisition_id = requisitions.id
      WHERE requisitions.id = $1 AND requisitions.deleted_at IS NULL
      GROUP BY requisitions.id, users.full_name
    `,
    [id]
  );
  if (!result.rows[0]) return null;
  const items = await getPool().query(
    `
      SELECT items.*, products.name AS product_name, products.sku, products.purchase_price, products.sale_price
      FROM purchase_requisition_items items
      INNER JOIN products ON products.id = items.product_id
      WHERE items.requisition_id = $1
      ORDER BY items.id ASC
    `,
    [id]
  );
  return {
    ...mapRequisition(result.rows[0]),
    items: items.rows.map((row) => ({
      id: Number(row.id),
      productId: Number(row.product_id),
      productName: row.product_name,
      sku: row.sku,
      requiredQty: number(row.required_qty),
      reason: row.reason || '',
      cost: number(row.purchase_price),
      salePrice: number(row.sale_price)
    }))
  };
}

async function createRequisition(payload, userId) {
  return withTransaction(async (client) => {
    const requisitionNumber = await generateRequisitionNumber();
    const requisition = await client.query(
      `
        INSERT INTO purchase_requisitions (
          requisition_number, requested_by, requested_date, department, location, reason, priority, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
        RETURNING *
      `,
      [requisitionNumber, userId, payload.requestedDate || new Date().toISOString().slice(0, 10), payload.department || null, payload.location || null, payload.reason || null, payload.priority || 'Normal']
    );
    for (const item of payload.items) {
      await client.query(
        'INSERT INTO purchase_requisition_items (requisition_id, product_id, required_qty, reason) VALUES ($1, $2, $3, $4)',
        [requisition.rows[0].id, item.productId, item.requiredQty, item.reason || null]
      );
    }
    return mapRequisition(requisition.rows[0]);
  });
}

async function updateRequisitionStatus(id, status, userId, notes = '') {
  const result = await getPool().query(
    `
      UPDATE purchase_requisitions
      SET status = $2,
          approved_by = CASE WHEN $2 = 'APPROVED' THEN $3 ELSE approved_by END,
          approved_at = CASE WHEN $2 = 'APPROVED' THEN NOW() ELSE approved_at END,
          approval_notes = CASE WHEN $2 = 'APPROVED' THEN $4 ELSE approval_notes END,
          rejection_reason = CASE WHEN $2 = 'REJECTED' THEN $4 ELSE rejection_reason END,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [id, status, userId || null, notes || null]
  );
  return mapRequisition(result.rows[0]);
}

async function listOrders(filters = {}) {
  const params = [];
  const where = ['orders.deleted_at IS NULL'];
  if (filters.status) {
    params.push(String(filters.status).toUpperCase());
    where.push(`orders.status = $${params.length}`);
  }
  if (filters.supplierId) {
    params.push(Number(filters.supplierId));
    where.push(`orders.supplier_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim().toLowerCase()}%`);
    where.push(`(LOWER(orders.po_number) LIKE $${params.length} OR LOWER(suppliers.name) LIKE $${params.length} OR LOWER(COALESCE(requisitions.requisition_number,'')) LIKE $${params.length})`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`orders.created_at::date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`orders.created_at::date <= $${params.length}`);
  }
  const result = await getPool().query(
    `
      SELECT orders.*, suppliers.name AS supplier_name, users.full_name AS created_by_name,
             approvers.full_name AS approved_by_name, requisitions.requisition_number,
             COALESCE(SUM(items.ordered_qty), 0) AS ordered_total,
             COALESCE(SUM(items.received_qty), 0) AS received_total
      FROM purchase_orders orders
      LEFT JOIN suppliers ON suppliers.id = orders.supplier_id
      LEFT JOIN users ON users.id = orders.created_by
      LEFT JOIN users approvers ON approvers.id = orders.approved_by
      LEFT JOIN purchase_requisitions requisitions ON requisitions.id = orders.requisition_id
      LEFT JOIN purchase_order_items items ON items.purchase_order_id = orders.id
      WHERE ${where.join(' AND ')}
      GROUP BY orders.id, suppliers.name, users.full_name, approvers.full_name, requisitions.requisition_number
      ORDER BY orders.created_at DESC
      LIMIT 300
    `,
    params
  );
  return result.rows.map(mapOrder);
}

async function createOrder(payload, userId) {
  return withTransaction(async (client) => {
    if (payload.requisitionId) {
      const requisition = await client.query('SELECT * FROM purchase_requisitions WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [payload.requisitionId]);
      if (!requisition.rows[0]) throw new Error('REQUISITION_NOT_FOUND');
      if (requisition.rows[0].status !== 'APPROVED') throw new Error('REQUISITION_NOT_APPROVED');
    }
    const poNumber = payload.poNumber || await generateUniquePoNumber();
    const status = payload.status || 'PENDING_APPROVAL';
    const orderResult = await client.query(
      `
        INSERT INTO purchase_orders (
          po_number, requisition_id, supplier_id, status, expected_date, subtotal, discount, tax, total, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `,
      [poNumber, payload.requisitionId || null, payload.supplierId, status, payload.expectedDate || null, payload.subtotal, payload.discount, payload.tax, payload.total, payload.notes || null, userId]
    );
    const orderId = orderResult.rows[0].id;
    for (const item of payload.items) {
      await client.query(
        'INSERT INTO purchase_order_items (purchase_order_id, product_id, ordered_qty, cost, sale_price, total) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderId, item.productId, item.orderedQty, item.cost, item.salePrice, item.total]
      );
    }
    if (payload.requisitionId) {
      await client.query(
        "UPDATE purchase_requisitions SET status = 'CONVERTED_TO_PO', converted_purchase_order_id = $2, updated_at = NOW() WHERE id = $1",
        [payload.requisitionId, orderId]
      );
    }
    return mapOrder(orderResult.rows[0]);
  });
}

async function getStats() {
  const result = await getPool().query(
    `
      SELECT
        COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE deleted_at IS NULL AND created_at >= date_trunc('month', CURRENT_DATE)), 0)::int AS total_pos,
        COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE deleted_at IS NULL AND status IN ('DRAFT','PENDING','PENDING_APPROVAL','APPROVED','SENT_TO_SUPPLIER','SUPPLIER_CONFIRMED')), 0)::int AS pending_pos,
        COALESCE((SELECT COUNT(*) FROM goods_receipts WHERE received_at >= date_trunc('month', CURRENT_DATE)), 0)::int AS grn_completed,
        COALESCE((SELECT SUM(grand_total) FROM purchases WHERE deleted_at IS NULL AND purchase_date >= date_trunc('month', CURRENT_DATE)), 0)::numeric AS total_spent
    `
  );
  const row = result.rows[0] || {};
  return {
    totalPOs: Number(row.total_pos || 0),
    pendingPOs: Number(row.pending_pos || 0),
    grnCompleted: Number(row.grn_completed || 0),
    totalSpent: Number(row.total_spent || 0)
  };
}

async function listWarehouses() {
  const result = await getPool().query(
    `
      SELECT id, name, is_default
      FROM warehouses
      WHERE deleted_at IS NULL AND is_active = TRUE
      ORDER BY is_default DESC, name ASC
    `
  );
  return result.rows.map((row) => ({ id: Number(row.id), name: row.name, isDefault: Boolean(row.is_default) }));
}

async function convertRequisitionToOrder(requisitionId, payload, userId) {
  const requisition = await getRequisition(requisitionId);
  if (!requisition) throw new Error('REQUISITION_NOT_FOUND');
  if (requisition.status !== 'APPROVED') throw new Error('REQUISITION_NOT_APPROVED');
  const items = requisition.items.map((item) => ({
    productId: item.productId,
    orderedQty: item.requiredQty,
    cost: payload.costByProduct?.[item.productId] ?? item.cost,
    salePrice: payload.saleByProduct?.[item.productId] ?? item.salePrice,
    total: Number((item.requiredQty * (payload.costByProduct?.[item.productId] ?? item.cost)).toFixed(2))
  }));
  const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  return createOrder({
    requisitionId,
    supplierId: payload.supplierId,
    expectedDate: payload.expectedDate,
    subtotal,
    discount: payload.discount || 0,
    tax: payload.tax || 0,
    total: Number((subtotal - number(payload.discount) + number(payload.tax)).toFixed(2)),
    notes: payload.notes || `Converted from ${requisition.requisitionNumber}`,
    items
  }, userId);
}

async function getOrder(id) {
  const order = await getPool().query(
    `
      SELECT orders.*, suppliers.name AS supplier_name, users.full_name AS created_by_name,
             approvers.full_name AS approved_by_name, requisitions.requisition_number
      FROM purchase_orders orders
      LEFT JOIN suppliers ON suppliers.id = orders.supplier_id
      LEFT JOIN users ON users.id = orders.created_by
      LEFT JOIN users approvers ON approvers.id = orders.approved_by
      LEFT JOIN purchase_requisitions requisitions ON requisitions.id = orders.requisition_id
      WHERE orders.id = $1 AND orders.deleted_at IS NULL
      LIMIT 1
    `,
    [id]
  );
  if (!order.rows[0]) return null;
  const items = await getPool().query(
    `
      SELECT items.*, products.name AS product_name, products.sku
      FROM purchase_order_items items
      INNER JOIN products ON products.id = items.product_id
      WHERE items.purchase_order_id = $1
      ORDER BY items.id ASC
    `,
    [id]
  );
  const receipts = await listReceipts(id);
  return { ...mapOrder(order.rows[0]), items: items.rows.map(mapOrderItem), receipts };
}

async function updateStatus(id, status, userId, notes = '') {
  const result = await getPool().query(
    `
      UPDATE purchase_orders
      SET status = $2,
          approved_by = CASE WHEN $2 = 'APPROVED' THEN $3 ELSE approved_by END,
          approved_at = CASE WHEN $2 = 'APPROVED' THEN NOW() ELSE approved_at END,
          approval_notes = CASE WHEN $2 = 'APPROVED' THEN $4 ELSE approval_notes END,
          rejection_reason = CASE WHEN $2 = 'CANCELLED' THEN $4 ELSE rejection_reason END,
          closed_at = CASE WHEN $2 = 'CLOSED' THEN NOW() ELSE closed_at END,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [id, status, userId || null, notes || null]
  );
  return mapOrder(result.rows[0]);
}

async function markSentToSupplier(id, userId, notes = '') {
  const result = await getPool().query(
    `
      UPDATE purchase_orders
      SET status = 'SENT_TO_SUPPLIER', supplier_sent_at = NOW(), supplier_confirmation_notes = $3, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL AND status = 'APPROVED'
      RETURNING *
    `,
    [id, userId || null, notes || null]
  );
  return mapOrder(result.rows[0]);
}

async function confirmSupplier(id, payload = {}) {
  const result = await getPool().query(
    `
      UPDATE purchase_orders
      SET status = 'SUPPLIER_CONFIRMED',
          supplier_confirmed_at = NOW(),
          supplier_reference_number = $2,
          supplier_expected_delivery_date = $3,
          supplier_confirmation_notes = $4,
          expected_date = COALESCE($3, expected_date),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL AND status IN ('SENT_TO_SUPPLIER', 'APPROVED')
      RETURNING *
    `,
    [id, payload.supplierReferenceNumber || null, payload.expectedDate || null, payload.notes || null]
  );
  return mapOrder(result.rows[0]);
}

async function receiveOrder(payload, userId) {
  return withTransaction(async (client) => {
    const orderResult = await client.query('SELECT * FROM purchase_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [payload.purchaseOrderId]);
    const order = orderResult.rows[0];
    if (!order) throw new Error('PO_NOT_FOUND');
    if (['CANCELLED', 'CLOSED', 'INVOICED'].includes(order.status)) throw new Error('PO_NOT_RECEIVABLE');
    if (!['APPROVED', 'SENT_TO_SUPPLIER', 'SUPPLIER_CONFIRMED', 'PARTIALLY_RECEIVED'].includes(order.status)) throw new Error('PO_NOT_RECEIVABLE');

    const receiptNo = await generateReceiptNumber();
    const receiptResult = await client.query(
      `
        INSERT INTO goods_receipts (receipt_number, purchase_order_id, supplier_id, subtotal, discount, tax, total, paid_amount, due_amount, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7, $8, $9)
        RETURNING *
      `,
      [receiptNo, order.id, order.supplier_id, payload.subtotal, payload.discount, payload.tax, payload.total, payload.notes || null, userId]
    );
    const receipt = receiptResult.rows[0];
    const warehouseResult = await client.query('SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1');
    const warehouseId = warehouseResult.rows[0]?.id || null;

    for (const item of payload.items) {
      const orderItemResult = await client.query('SELECT * FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2 FOR UPDATE', [item.purchaseOrderItemId, order.id]);
      const orderItem = orderItemResult.rows[0];
      if (!orderItem) throw new Error('PO_ITEM_NOT_FOUND');
      const remaining = number(orderItem.ordered_qty) - number(orderItem.received_qty);
      const handledQty = Number((number(item.receivedQty) + number(item.damagedQty) + number(item.rejectedQty)).toFixed(3));
      if (handledQty > remaining) throw new Error('RECEIVE_EXCEEDS_ORDERED');

      const productResult = await client.query('SELECT id, current_stock, min_stock_level FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [orderItem.product_id]);
      const product = productResult.rows[0];
      if (!product) throw new Error('PRODUCT_NOT_FOUND');
      const previousStock = number(product.current_stock);
      const newStock = Number((previousStock + number(item.receivedQty)).toFixed(3));
      const lineTotal = Number((number(item.receivedQty) * number(orderItem.cost)).toFixed(2));

      await client.query('UPDATE purchase_order_items SET received_qty = received_qty + $2 WHERE id = $1', [orderItem.id, handledQty]);
      await client.query(
        `
          INSERT INTO goods_receipt_items (
            goods_receipt_id, purchase_order_item_id, product_id, received_qty, damaged_qty, rejected_qty, cost, sale_price, total
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [receipt.id, orderItem.id, orderItem.product_id, item.receivedQty, item.damagedQty || 0, item.rejectedQty || 0, orderItem.cost, orderItem.sale_price, lineTotal]
      );
      await client.query(
        'UPDATE products SET current_stock = $2, purchase_price = $3, sale_price = CASE WHEN $4 > 0 THEN $4 ELSE sale_price END, updated_at = NOW() WHERE id = $1',
        [orderItem.product_id, newStock, orderItem.cost, orderItem.sale_price]
      );
      if (warehouseId) {
        await client.query(
          `
            INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET current_stock = EXCLUDED.current_stock, updated_at = NOW()
          `,
          [orderItem.product_id, warehouseId, newStock, product.min_stock_level]
        );
      }
      await client.query(
        `
          INSERT INTO stock_movements (
            product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
            reference_type, reference_id, reason, notes, user_id, created_by
          )
          VALUES ($1, $2, 'PURCHASE_RECEIVE', $3, $4, $5, 'goods_receipt', $6, 'Goods received against purchase order', $7, $8, $8)
        `,
        [orderItem.product_id, warehouseId, item.receivedQty, previousStock, newStock, receipt.id, receiptNo, userId]
      );
    }

    const statusResult = await client.query(
      `
        SELECT COALESCE(SUM(ordered_qty), 0)::numeric AS ordered, COALESCE(SUM(received_qty), 0)::numeric AS received
        FROM purchase_order_items
        WHERE purchase_order_id = $1
      `,
      [order.id]
    );
    const totals = statusResult.rows[0];
    const nextStatus = number(totals.received) >= number(totals.ordered) ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';
    await client.query('UPDATE purchase_orders SET status = $2, updated_at = NOW() WHERE id = $1', [order.id, nextStatus]);
    return { receipt: mapReceipt(receipt), status: nextStatus };
  });
}

async function createInvoiceFromReceipt(payload, userId) {
  return withTransaction(async (client) => {
    const receiptResult = await client.query(
      `
        SELECT receipts.*, orders.status AS po_status
        FROM goods_receipts receipts
        INNER JOIN purchase_orders orders ON orders.id = receipts.purchase_order_id
        WHERE receipts.id = $1
        FOR UPDATE OF receipts, orders
      `,
      [payload.goodsReceiptId]
    );
    const receipt = receiptResult.rows[0];
    if (!receipt) throw new Error('RECEIPT_NOT_FOUND');
    if (receipt.purchase_id) throw new Error('RECEIPT_ALREADY_INVOICED');
    if (['CANCELLED', 'CLOSED'].includes(receipt.po_status)) throw new Error('PO_NOT_INVOICEABLE');

    const items = await client.query(
      `
        SELECT receipt_items.*, order_items.cost, order_items.sale_price
        FROM goods_receipt_items receipt_items
        INNER JOIN purchase_order_items order_items ON order_items.id = receipt_items.purchase_order_item_id
        WHERE receipt_items.goods_receipt_id = $1
      `,
      [receipt.id]
    );
    if (!items.rows.length) throw new Error('RECEIPT_HAS_NO_ITEMS');
    const subtotal = Number(items.rows.reduce((sum, item) => sum + number(item.total), 0).toFixed(2));
    const discount = number(payload.discount);
    const tax = number(payload.tax);
    const grandTotal = Number((subtotal - discount + tax).toFixed(2));
    const paidAmount = number(payload.paidAmount);
    if (discount > subtotal || paidAmount > grandTotal) throw new Error('INVALID_INVOICE_TOTALS');
    const dueAmount = Number((grandTotal - paidAmount).toFixed(2));
    const status = dueAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    const invoiceNumber = payload.invoiceNumber || await generatePurchaseInvoiceNumber();

    const purchase = await client.query(
      `
        INSERT INTO purchases (
          supplier_id, invoice_number, supplier_invoice_number, invoice_date, purchase_date, purchase_order_id, goods_receipt_id,
          subtotal, discount, tax, grand_total, paid_amount, due_amount, status, created_by
        )
        VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `,
      [receipt.supplier_id, invoiceNumber, payload.supplierInvoiceNumber || null, payload.invoiceDate || new Date().toISOString().slice(0, 10), receipt.purchase_order_id, receipt.id, subtotal, discount, tax, grandTotal, paidAmount, dueAmount, status, userId]
    );
    const purchaseId = purchase.rows[0].id;
    for (const item of items.rows) {
      await client.query(
        'INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_price, sale_price, total) VALUES ($1, $2, $3, $4, $5, $6)',
        [purchaseId, item.product_id, item.received_qty, item.cost, item.sale_price, item.total]
      );
    }
    await client.query('UPDATE goods_receipts SET purchase_id = $2, discount = $3, tax = $4, total = $5, paid_amount = $6, due_amount = $7 WHERE id = $1', [receipt.id, purchaseId, discount, tax, grandTotal, paidAmount, dueAmount]);
    await client.query("UPDATE purchase_orders SET status = CASE WHEN status = 'FULLY_RECEIVED' THEN 'INVOICED' ELSE status END, updated_at = NOW() WHERE id = $1", [receipt.purchase_order_id]);

    if (receipt.supplier_id) {
      const supplier = await client.query('SELECT current_balance FROM suppliers WHERE id = $1 FOR UPDATE', [receipt.supplier_id]);
      const balance = Number((number(supplier.rows[0]?.current_balance) + dueAmount).toFixed(2));
      await client.query('UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1', [receipt.supplier_id, balance]);
      await client.query(
        `
          INSERT INTO supplier_ledger (supplier_id, purchase_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
          VALUES ($1, $2, 'purchase_invoice', $2, $3, $4, $5, $6, $7, $8)
        `,
        [receipt.supplier_id, purchaseId, status, grandTotal, paidAmount, balance, `Invoice ${invoiceNumber} from ${receipt.receipt_number}`, userId]
      );
    }
    return { purchaseId: Number(purchaseId), invoiceNumber, status, grandTotal, paidAmount, dueAmount };
  });
}

async function listReceipts(purchaseOrderId = null) {
  const params = [];
  const where = [];
  if (purchaseOrderId) {
    params.push(Number(purchaseOrderId));
    where.push(`receipts.purchase_order_id = $${params.length}`);
  }
  const result = await getPool().query(
    `
      SELECT receipts.*, suppliers.name AS supplier_name, users.full_name AS created_by_name
      FROM goods_receipts receipts
      LEFT JOIN suppliers ON suppliers.id = receipts.supplier_id
      LEFT JOIN users ON users.id = receipts.created_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY receipts.received_at DESC
      LIMIT 300
    `,
    params
  );
  return result.rows.map(mapReceipt);
}

module.exports = {
  confirmSupplier,
  convertRequisitionToOrder,
  createInvoiceFromReceipt,
  createOrder,
  createRequisition,
  generateUniquePoNumber,
  getStats,
  getOrder,
  getRequisition,
  listOrders,
  listReceipts,
  listRequisitions,
  listWarehouses,
  markSentToSupplier,
  receiveOrder,
  updateRequisitionStatus,
  updateStatus
};
